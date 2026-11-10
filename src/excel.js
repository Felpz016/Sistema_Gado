// Gera a planilha Excel (.xlsx) com TUDO que está no sistema.
// Abas: Resumo, Lotes, Entradas, Saídas, Pesagens, Sanidade.
import { utils, writeFile } from "xlsx";
import {
  hojeISO, dias, pesoAtual, calcGmd, ultimoGmd, saidaDoLote, resumo, pesagensDoLote,
} from "./calc.js";

// "AAAA-MM-DD" → data do Excel (sem problema de fuso).
const dt = (iso) => (iso ? new Date(iso + "T12:00:00") : null);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
const sexo = (s) => (s === "M" ? "Macho" : "Fêmea");

function aba(linhas, larguras) {
  if (!linhas.length) {
    const ws = utils.aoa_to_sheet([["Nenhum registro ainda."]]);
    ws["!cols"] = [{ wch: 30 }];
    return ws;
  }
  const ws = utils.json_to_sheet(linhas, { cellDates: true });
  // Datas no formato brasileiro; GMD com 3 casas; ganhos com 1 casa.
  const range = utils.decode_range(ws["!ref"]);
  const cab = [];
  for (let C = 0; C <= range.e.c; C++) cab[C] = String(ws[utils.encode_cell({ r: 0, c: C })]?.v ?? "");
  for (let R = 1; R <= range.e.r; R++) {
    for (let C = 0; C <= range.e.c; C++) {
      const c = ws[utils.encode_cell({ r: R, c: C })];
      if (!c) continue;
      if (c.v instanceof Date) { c.t = "d"; c.z = cab[C] === "Valor" ? "dd/mm/yyyy hh:mm" : "dd/mm/yyyy"; }
      else if (c.t === "n" && /GMD/.test(cab[C] + (R && ws["A" + (R + 1)]?.v))) c.z = "0.000";
      else if (c.t === "n" && /Ganho|Total aplicado|Dose|Peso médio do rebanho/.test(cab[C] + (ws["A" + (R + 1)]?.v ?? ""))) c.z = "0.0";
    }
  }
  ws["!autofilter"] = { ref: ws["!ref"] };
  ws["!cols"] = larguras.map((w) => ({ wch: w }));
  return ws;
}

export function linhasPlanilha(db) {
  const hoje = hojeISO();
  const loteById = Object.fromEntries(db.lotes.map((l) => [l.id, l]));
  const nome = (id) => loteById[id]?.numero ?? "(lote excluído)";
  const porData = (a, b) => a.data.localeCompare(b.data);
  const r = resumo(db);

  const Resumo = [
    { Indicador: "Fazenda", Valor: "Fazenda São João" },
    { Indicador: "Planilha gerada em", Valor: new Date() },
    { Indicador: "Cabeças ativas", Valor: r.cabecas },
    { Indicador: "Machos ativos", Valor: r.machos },
    { Indicador: "Fêmeas ativas", Valor: r.femeas },
    { Indicador: "Lotes ativos", Valor: r.lotesAtivos },
    { Indicador: "Lotes que já saíram", Valor: r.lotesSaidos },
    { Indicador: "Peso médio do rebanho (kg/cabeça)", Valor: r1(r.pesoMedio) },
    { Indicador: "Peso total do rebanho (kg)", Valor: Math.round(r.pesoTotal) },
    { Indicador: "GMD médio (kg/dia)", Valor: r3(r.gmdMedio) },
    { Indicador: "Pesagens registradas", Valor: db.pesagens.length },
    { Indicador: "Manejos sanitários registrados", Valor: db.sanidade.length },
  ];

  const lotesOrd = [...db.lotes].sort((a, b) => a.dataEntrada.localeCompare(b.dataEntrada));
  const Lotes = lotesOrd.map((l) => {
    const pa = pesoAtual(db, l);
    const s = saidaDoLote(db, l.id);
    const fim = s ? s.data : hoje;
    const g = ultimoGmd(db, l);
    return {
      Lote: l.numero,
      Situação: l.ativo ? "Ativo" : "Saiu",
      Cabeças: l.quantidade,
      Sexo: sexo(l.sexo),
      Raça: l.raca || "",
      "Idade na entrada (meses)": l.idadeMeses,
      "Data de entrada": dt(l.dataEntrada),
      "Peso de entrada (kg)": l.pesoEntrada,
      "Peso atual (kg)": pa.peso,
      "Data do peso atual": dt(pa.data),
      "Ganho desde a entrada (kg)": r1(pa.peso - l.pesoEntrada),
      "GMD da última pesagem": r3(g),
      "GMD desde a entrada": pa.origem === "pesagem" && dias(l.dataEntrada, pa.data) > 0
        ? r3((pa.peso - l.pesoEntrada) / dias(l.dataEntrada, pa.data)) : null,
      "Nº de pesagens": pesagensDoLote(db, l.id).length,
      "Dias na fazenda": dias(l.dataEntrada, fim),
      "Data de saída": s ? dt(s.data) : null,
      Observações: l.obs || "",
    };
  });

  const Entradas = lotesOrd.map((l) => ({
    "Data de entrada": dt(l.dataEntrada),
    Lote: l.numero,
    Cabeças: l.quantidade,
    Sexo: sexo(l.sexo),
    Raça: l.raca || "",
    "Idade (meses)": l.idadeMeses,
    "Peso médio de entrada (kg)": l.pesoEntrada,
    "Peso total de entrada (kg)": Math.round(l.pesoEntrada * l.quantidade),
    Observações: l.obs || "",
  }));

  const Saidas = [...db.saidas].sort(porData).map((s) => {
    const l = loteById[s.loteId];
    return {
      "Data de saída": dt(s.data),
      Lote: nome(s.loteId),
      Motivo: s.motivo,
      "Destino / comprador": s.destino || "",
      Cabeças: s.quantidade,
      "Peso médio de saída (kg)": s.peso ?? null,
      "Ganho desde a entrada (kg)": l && s.peso ? r1(s.peso - l.pesoEntrada) : null,
      "Dias na fazenda": l ? dias(l.dataEntrada, s.data) : null,
      Observação: s.obs || "",
    };
  });

  const Pesagens = [...db.pesagens].sort((a, b) => porData(a, b) || nome(a.loteId).localeCompare(nome(b.loteId))).map((p) => {
    const l = loteById[p.loteId];
    const c = l ? calcGmd(db, l, p) : null;
    return {
      Data: dt(p.data),
      Lote: nome(p.loteId),
      "Peso médio (kg/animal)": p.peso,
      "Comparado com": c ? c.ref.tipo : "",
      "Data anterior": c ? dt(c.ref.data) : null,
      "Peso anterior (kg)": c ? c.ref.peso : null,
      Dias: c ? c.dias : null,
      "Ganho (kg)": c ? r1(c.ganho) : null,
      "GMD (kg/dia)": c ? r3(c.gmd) : null,
    };
  });

  const Sanidade = [...db.sanidade].sort(porData).map((s) => {
    const l = loteById[s.loteId];
    return {
      Data: dt(s.data),
      Lote: nome(s.loteId),
      "Vacina / procedimento": s.procedimento,
      "Dose por animal (ml)": s.doseMl,
      Cabeças: l ? l.quantidade : null,
      "Total aplicado (ml)": l ? r1(s.doseMl * l.quantidade) : null,
    };
  });

  return { Resumo, Lotes, Entradas, Saídas: Saidas, Pesagens, Sanidade };
}

const LARGURAS = {
  Resumo: [36, 22],
  Lotes: [9, 9, 9, 8, 24, 12, 12, 12, 12, 12, 14, 12, 12, 10, 10, 12, 40],
  Entradas: [12, 9, 9, 8, 24, 10, 14, 14, 40],
  Saídas: [12, 9, 14, 26, 9, 14, 14, 10, 30],
  Pesagens: [12, 9, 14, 16, 12, 14, 7, 10, 10],
  Sanidade: [12, 9, 32, 12, 9, 14],
};

export function baixarPlanilha(db) {
  const wb = utils.book_new();
  const abas = linhasPlanilha(db);
  for (const [nome, linhas] of Object.entries(abas)) {
    utils.book_append_sheet(wb, aba(linhas, LARGURAS[nome]), nome);
  }
  writeFile(wb, `gado-fazenda-sao-joao-${hojeISO()}.xlsx`, { cellDates: true });
}
