// Gera a planilha Excel (.xlsx) com TUDO que está no sistema, já formatada.
// Abas: Resumo (painel com indicadores), Lotes, Entradas, Saídas, Pesagens, Sanidade.
import ExcelJS from "exceljs";
import {
  hojeISO, dias, pesoAtual, calcGmd, ultimoGmd, saidaDoLote, resumo, pesagensDoLote,
} from "./calc.js";

const FAZENDA = "Fazenda São João";

// "AAAA-MM-DD" → data do Excel (sem problema de fuso).
const dt = (iso) => (iso ? new Date(iso + "T12:00:00") : null);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
const sexo = (s) => (s === "M" ? "Macho" : "Fêmea");

// ------------------------------------------------------------ dados (uma linha por registro)
export function linhasPlanilha(db) {
  const hoje = hojeISO();
  const loteById = Object.fromEntries(db.lotes.map((l) => [l.id, l]));
  const nome = (id) => loteById[id]?.numero ?? "(lote excluído)";
  const porData = (a, b) => a.data.localeCompare(b.data);

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
      "Peso total de saída (kg)": s.peso && s.quantidade ? Math.round(s.peso * s.quantidade) : null,
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

  return { Lotes, Entradas, Saídas: Saidas, Pesagens, Sanidade };
}

// ------------------------------------------------------------ visual
const COR = {
  verde: "FF2E5E3B", verdeEsc: "FF1F4229", verdeClaro: "FFD6E5D3", zebra: "FFF4F7F0",
  papel: "FFFBFCF8", linha: "FFCBD3C2", texto: "FF1E2A1F", apagado: "FF5C6A5B",
  terra: "FF8A5A2B", terraClara: "FFF0E3D2", amarelo: "FFB26A00", amareloClaro: "FFFBE8C8",
  vermelho: "FFA63A2C", vermelhoClaro: "FFF6D9D4", cinza: "FFE6E8E3", branco: "FFFFFFFF",
};
const FONTE = "Calibri";
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const borda = (argb = COR.linha) => {
  const b = { style: "thin", color: { argb } };
  return { top: b, left: b, bottom: b, right: b };
};

// GMD (kg/dia): faixas usadas para colorir.
const GMD_BOM = 0.7, GMD_REGULAR = 0.4;
function corGmd(g) {
  if (g == null) return null;
  if (g >= GMD_BOM) return { bg: COR.verdeClaro, fg: COR.verdeEsc };
  if (g >= GMD_REGULAR) return { bg: COR.amareloClaro, fg: COR.amarelo };
  return { bg: COR.vermelhoClaro, fg: COR.vermelho };
}

// Formato, alinhamento, largura e total de cada coluna, pelo nome do cabeçalho.
function coluna(h) {
  if (/^Data|Data /.test(h)) return { fmt: "dd/mm/yyyy", al: "center", w: 13 };
  if (/GMD/.test(h)) return { fmt: "0.000", al: "center", w: 13, total: "media" };
  if (/Peso total/.test(h)) return { fmt: "#,##0", al: "right", w: 15, total: "soma" };
  if (/Total aplicado/.test(h)) return { fmt: "#,##0.0", al: "right", w: 13, total: "soma" };
  if (/Dose/.test(h)) return { fmt: "#,##0.0", al: "right", w: 12 };
  if (/Ganho/.test(h)) return { fmt: "+#,##0.0;-#,##0.0;0.0", al: "right", w: 13, total: "media" };
  if (/\(kg/.test(h)) return { fmt: "#,##0.0", al: "right", w: 13, total: "media" };
  if (h === "Cabeças") return { fmt: "#,##0", al: "center", w: 10, total: "soma" };
  if (/^Dias/.test(h)) return { fmt: "0", al: "center", w: 10, total: "media" };
  if (/Nº|Idade/.test(h)) return { fmt: "0", al: "center", w: 11 };
  if (/^Lote$|Situação|Sexo|Motivo/.test(h)) return { al: "center", w: 10 };
  if (/Comparado/.test(h)) return { al: "left", w: 16 };
  if (/Observa/.test(h)) return { al: "left", w: 40, wrap: true };
  if (/Vacina/.test(h)) return { al: "left", w: 32, wrap: true };
  return { al: "left", w: 24, wrap: true };
}

function agora() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function letra(n) { // 1 → A
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Faixa de título (linha 1) e subtítulo (linha 2) ocupando `ncol` colunas a partir de `c0`. */
function titulo(ws, texto, sub, c0, ncol) {
  const ate = letra(c0 + ncol - 1);
  ws.mergeCells(`${letra(c0)}1:${ate}1`);
  ws.mergeCells(`${letra(c0)}2:${ate}2`);
  const t = ws.getCell(`${letra(c0)}1`);
  t.value = texto;
  t.font = { name: FONTE, size: 16, bold: true, color: { argb: COR.branco } };
  t.fill = fill(COR.verde);
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  const s = ws.getCell(`${letra(c0)}2`);
  s.value = sub;
  s.font = { name: FONTE, size: 10, italic: true, color: { argb: COR.apagado } };
  s.fill = fill(COR.verdeClaro);
  s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 32;
  ws.getRow(2).height = 20;
}

function impressao(ws, linhaCab) {
  ws.pageSetup = {
    paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    horizontalCentered: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
    ...(linhaCab ? { printTitlesRow: `${linhaCab}:${linhaCab}` } : {}),
  };
  ws.headerFooter = { oddFooter: `&L&8${FAZENDA} · &A&R&8Página &P de &N` };
}

const LINHA_CAB = 4;
const SUB_ABA = {
  Lotes: "Todos os lotes, ativos e que já saíram, com peso atual, ganho e GMD.",
  Entradas: "Cada lote que entrou na fazenda, com peso e quantidade na chegada.",
  Saídas: "Histórico de saídas (venda, morte, transferência) com peso e ganho no período.",
  Pesagens: "Todas as pesagens. O GMD compara com a pesagem anterior do lote (ou com a entrada).",
  Sanidade: "Vacinas e procedimentos aplicados, com dose e total gasto por lote.",
};
const COR_ABA = { Lotes: COR.verde, Entradas: "FF3F7A4D", Saídas: COR.terra, Pesagens: COR.amarelo, Sanidade: "FF2F6F8F" };
const CONGELA_COLS = { Lotes: 2, Entradas: 2, Saídas: 2, Pesagens: 2, Sanidade: 2 };

/** Aba de tabela: título, cabeçalho colorido, linhas alternadas, filtros, painel congelado e totais. */
function abaTabela(wb, nome, linhas, geradaEm) {
  const ws = wb.addWorksheet(nome, {
    properties: { tabColor: { argb: COR_ABA[nome] } },
    views: [{ state: "frozen", xSplit: linhas.length ? CONGELA_COLS[nome] : 0, ySplit: LINHA_CAB, showGridLines: false, zoomScale: 110 }],
  });
  const cab = linhas.length ? Object.keys(linhas[0]) : [];
  const ncol = Math.max(cab.length, 6);
  const plural = linhas.length === 1 ? "registro" : "registros";
  titulo(ws, `${FAZENDA.toUpperCase()}  ·  ${nome}`, `${SUB_ABA[nome]}   ${linhas.length} ${plural} · gerada em ${geradaEm}`, 1, ncol);
  ws.getRow(3).height = 6;
  impressao(ws, LINHA_CAB);

  if (!linhas.length) {
    ws.mergeCells(`A${LINHA_CAB}:${letra(ncol)}${LINHA_CAB}`);
    const c = ws.getCell(`A${LINHA_CAB}`);
    c.value = "Nenhum registro ainda.";
    c.font = { name: FONTE, size: 11, italic: true, color: { argb: COR.apagado } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(LINHA_CAB).height = 28;
    for (let i = 1; i <= ncol; i++) ws.getColumn(i).width = 16;
    return ws;
  }

  const cols = cab.map(coluna);
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.w; });

  // Cabeçalho
  const rc = ws.getRow(LINHA_CAB);
  rc.height = 46;
  cab.forEach((h, i) => {
    const c = rc.getCell(i + 1);
    c.value = h;
    c.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.branco } };
    c.fill = fill(COR.verdeEsc);
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = borda(COR.verdeEsc);
  });

  // Linhas
  linhas.forEach((obj, k) => {
    const r = ws.getRow(LINHA_CAB + 1 + k);
    const saiu = obj["Situação"] === "Saiu";
    const fundo = saiu ? COR.cinza : k % 2 ? COR.zebra : COR.papel;
    let maxLinhas = 1;
    cab.forEach((h, i) => {
      const c = r.getCell(i + 1);
      const v = obj[h];
      c.value = v === "" ? null : v;
      const spec = cols[i];
      c.font = { name: FONTE, size: 10, color: { argb: saiu ? COR.apagado : COR.texto }, bold: h === "Lote" };
      c.fill = fill(fundo);
      c.border = borda();
      c.alignment = { vertical: "middle", horizontal: spec.al, wrapText: !!spec.wrap, indent: spec.al === "left" ? 1 : 0 };
      if (spec.fmt) c.numFmt = spec.fmt;
      if (spec.wrap && typeof v === "string") maxLinhas = Math.max(maxLinhas, Math.ceil(v.length / (spec.w * 1.05)));

      // Destaques
      if (h === "Situação") {
        c.fill = fill(saiu ? COR.terraClara : COR.verdeClaro);
        c.font = { name: FONTE, size: 10, bold: true, color: { argb: saiu ? COR.terra : COR.verdeEsc } };
      } else if (/GMD/.test(h) && typeof v === "number") {
        const g = corGmd(v);
        c.fill = fill(g.bg);
        c.font = { name: FONTE, size: 10, bold: true, color: { argb: g.fg } };
      } else if (/Ganho/.test(h) && typeof v === "number" && v < 0) {
        c.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.vermelho } };
      } else if (h === "Motivo" && v) {
        const morte = /morte|óbito/i.test(v);
        c.fill = fill(morte ? COR.vermelhoClaro : COR.terraClara);
        c.font = { name: FONTE, size: 10, bold: true, color: { argb: morte ? COR.vermelho : COR.terra } };
      } else if (v == null && (spec.fmt || /^Data/.test(h))) {
        c.value = "—";
        c.font = { name: FONTE, size: 10, color: { argb: COR.apagado } };
        c.alignment = { vertical: "middle", horizontal: "center" };
      }
    });
    r.height = Math.max(20, 15 * maxLinhas + 4);
  });

  // Totais (SUBTOTAL: respeita o filtro, conta só as linhas visíveis)
  const ini = LINHA_CAB + 1, fim = LINHA_CAB + linhas.length, lt = fim + 1;
  const rt = ws.getRow(lt);
  rt.height = 22;
  cab.forEach((h, i) => {
    const c = rt.getCell(i + 1);
    const spec = cols[i];
    c.fill = fill(COR.verdeClaro);
    c.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.verdeEsc } };
    c.border = { top: { style: "medium", color: { argb: COR.verde } }, bottom: { style: "medium", color: { argb: COR.verde } } };
    c.alignment = { vertical: "middle", horizontal: spec.al };
    const nums = linhas.map((o) => o[h]).filter((x) => typeof x === "number");
    if (spec.total && nums.length) {
      const soma = nums.reduce((a, b) => a + b, 0);
      const L = letra(i + 1);
      c.value = spec.total === "soma"
        ? { formula: `SUBTOTAL(109,${L}${ini}:${L}${fim})`, result: soma }
        : { formula: `SUBTOTAL(101,${L}${ini}:${L}${fim})`, result: soma / nums.length };
      c.numFmt = spec.fmt;
    }
  });
  const lbl = rt.getCell(1);
  lbl.value = "TOTAL / MÉDIA";
  lbl.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  const nota = ws.getCell(`A${lt + 1}`);
  nota.value = "Totais somam e médias calculam só as linhas visíveis: use os filtros (setas no cabeçalho) para ver por lote, raça, período…";
  nota.font = { name: FONTE, size: 9, italic: true, color: { argb: COR.apagado } };

  ws.autoFilter = { from: { row: LINHA_CAB, column: 1 }, to: { row: fim, column: cab.length } };
  return ws;
}

// ------------------------------------------------------------ Resumo (painel)
function abaResumo(wb, db, geradaEm) {
  const ws = wb.addWorksheet("Resumo", {
    properties: { tabColor: { argb: COR.verdeEsc } },
    views: [{ showGridLines: false, zoomScale: 110 }],
  });
  ws.getColumn(1).width = 2;
  for (let i = 2; i <= 9; i++) ws.getColumn(i).width = 15;
  ws.getColumn(3).width = 24; // Raça
  titulo(ws, `${FAZENDA.toUpperCase()}  ·  Resumo do rebanho`, `Planilha gerada em ${geradaEm} com todos os dados do sistema`, 2, 8);
  impressao(ws, null);
  ws.pageSetup.orientation = "portrait";

  const r = resumo(db);
  const ativos = db.lotes.filter((l) => l.ativo);
  const cabSaidas = db.saidas.reduce((s, x) => s + (x.quantidade || 0), 0);
  let linha = 4;

  const secao = (texto) => {
    ws.mergeCells(`B${linha}:I${linha}`);
    const c = ws.getCell(`B${linha}`);
    c.value = texto.toUpperCase();
    c.font = { name: FONTE, size: 11, bold: true, color: { argb: COR.verde } };
    c.border = { bottom: { style: "medium", color: { argb: COR.verde } } };
    ws.getRow(linha).height = 22;
    linha += 2;
  };

  // Cartões: rótulo, número grande, unidade. 4 por linha, 2 colunas cada.
  const cartoes = (lista) => {
    lista.forEach(([rot, val, fmt, uni, destaque], i) => {
      const col = 2 + (i % 4) * 2;
      const l0 = linha + Math.floor(i / 4) * 4;
      const A = letra(col), B = letra(col + 1);
      [[l0, rot], [l0 + 1, val], [l0 + 2, uni]].forEach(([ln, v], j) => {
        ws.mergeCells(`${A}${ln}:${B}${ln}`);
        const c = ws.getCell(`${A}${ln}`);
        c.value = v ?? "—";
        c.fill = fill(destaque ? COR.verdeClaro : COR.zebra);
        c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        c.font = j === 1
          ? { name: FONTE, size: 22, bold: true, color: { argb: destaque ? COR.verdeEsc : COR.texto } }
          : { name: FONTE, size: j ? 9 : 10, bold: !j, color: { argb: COR.apagado } };
        if (j === 1 && fmt && v != null) c.numFmt = fmt;
        const lado = { style: "thin", color: { argb: COR.linha } };
        c.border = {
          left: lado, right: lado,
          ...(j === 0 ? { top: { style: "thick", color: { argb: destaque ? COR.verde : COR.terra } } } : {}),
          ...(j === 2 ? { bottom: lado } : {}),
        };
      });
      ws.getRow(l0).height = 20;
      ws.getRow(l0 + 1).height = 34;
      ws.getRow(l0 + 2).height = 16;
      ws.getRow(l0 + 3).height = 8;
    });
    linha += Math.ceil(lista.length / 4) * 4 + 1;
  };

  secao("Rebanho hoje");
  cartoes([
    ["Cabeças ativas", r.cabecas, "#,##0", "cabeças na fazenda", true],
    ["Lotes ativos", r.lotesAtivos, "0", "lotes", true],
    ["Peso médio do rebanho", r1(r.pesoMedio), "#,##0.0", "kg por cabeça", true],
    ["GMD médio", r3(r.gmdMedio), "0.000", "kg/dia (média por cabeça)", true],
    ["Machos ativos", r.machos, "#,##0", "cabeças"],
    ["Fêmeas ativas", r.femeas, "#,##0", "cabeças"],
    ["Peso total do rebanho", Math.round(r.pesoTotal), "#,##0", "kg (peso vivo)"],
    ["Lotes que já saíram", r.lotesSaidos, "0", "lotes encerrados"],
  ]);
  secao("Registros no sistema");
  cartoes([
    ["Lotes cadastrados", db.lotes.length, "0", "entradas"],
    ["Cabeças que saíram", cabSaidas, "#,##0", `em ${db.saidas.length} ${db.saidas.length === 1 ? "saída" : "saídas"}`],
    ["Pesagens", db.pesagens.length, "0", "registradas"],
    ["Manejos sanitários", db.sanidade.length, "0", "vacinas e procedimentos"],
  ]);

  // Tabela-resumo genérica
  const tabela = (cab, linhas, specs) => {
    const rc = ws.getRow(linha);
    rc.height = 30;
    cab.forEach((h, i) => {
      const c = rc.getCell(2 + i);
      c.value = h;
      c.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.branco } };
      c.fill = fill(COR.verdeEsc);
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = borda(COR.verdeEsc);
    });
    linha++;
    linhas.forEach((vals, k) => {
      const row = ws.getRow(linha);
      row.height = 20;
      vals.forEach((v, i) => {
        const c = row.getCell(2 + i);
        const s = specs[i] || {};
        c.value = v ?? "—";
        c.fill = fill(k % 2 ? COR.zebra : COR.papel);
        c.border = borda();
        c.font = { name: FONTE, size: 10, bold: !!s.bold, color: { argb: v == null ? COR.apagado : COR.texto } };
        c.alignment = { horizontal: s.al || "center", vertical: "middle", indent: s.al === "left" ? 1 : 0 };
        if (s.fmt && v != null) c.numFmt = s.fmt;
        if (s.gmd && typeof v === "number") {
          const g = corGmd(v);
          c.fill = fill(g.bg);
          c.font = { name: FONTE, size: 10, bold: true, color: { argb: g.fg } };
        }
      });
      linha++;
    });
  };

  secao("Lotes ativos");
  if (ativos.length) {
    const ord = [...ativos].sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }));
    tabela(
      ["Lote", "Raça", "Sexo", "Cabeças", "Peso atual (kg)", "Último GMD (kg/dia)", "Dias na fazenda", "Última pesagem"],
      ord.map((l) => {
        const pa = pesoAtual(db, l);
        return [l.numero, l.raca || null, sexo(l.sexo), l.quantidade, pa.peso, r3(ultimoGmd(db, l)),
          dias(l.dataEntrada, hojeISO()), pa.origem === "pesagem" ? dt(pa.data) : null];
      }),
      [{ bold: true }, { al: "left" }, {}, { fmt: "#,##0" }, { fmt: "#,##0.0" }, { fmt: "0.000", gmd: true }, { fmt: "0" }, { fmt: "dd/mm/yyyy" }],
    );
  } else {
    ws.getCell(`B${linha}`).value = "Nenhum lote ativo.";
    linha++;
  }
  linha++;

  secao("Cabeças por raça (lotes ativos)");
  const porRaca = {};
  ativos.forEach((l) => {
    const k = l.raca || "(sem raça informada)";
    porRaca[k] = porRaca[k] || { cab: 0, m: 0, f: 0 };
    porRaca[k].cab += l.quantidade;
    porRaca[k][l.sexo === "M" ? "m" : "f"] += l.quantidade;
  });
  const racas = Object.entries(porRaca).sort((a, b) => b[1].cab - a[1].cab);
  if (racas.length) {
    // Raça ocupa 3 colunas (B:D)
    const ini = linha;
    tabela(["Raça", "", "", "Machos", "Fêmeas", "Total", "% do rebanho"],
      racas.map(([k, v]) => [k, null, null, v.m, v.f, v.cab, r.cabecas ? v.cab / r.cabecas : null]),
      [{ al: "left", bold: true }, {}, {}, { fmt: "#,##0" }, { fmt: "#,##0" }, { fmt: "#,##0" }, { fmt: "0.0%" }]);
    for (let ln = ini; ln < linha; ln++) {
      ws.mergeCells(`B${ln}:D${ln}`);
    }
  } else {
    ws.getCell(`B${linha}`).value = "Nenhum lote ativo.";
    linha++;
  }
  linha++;

  secao("Como ler as cores");
  const leg = [
    [corGmd(1), `GMD bom: ${GMD_BOM.toFixed(3).replace(".", ",")} kg/dia ou mais`],
    [corGmd(0.5), `GMD regular: de ${GMD_REGULAR.toFixed(3).replace(".", ",")} a ${(GMD_BOM - 0.001).toFixed(3).replace(".", ",")} kg/dia`],
    [corGmd(0), `GMD baixo: menos de ${GMD_REGULAR.toFixed(3).replace(".", ",")} kg/dia (ou perda de peso)`],
    [{ bg: COR.terraClara, fg: COR.terra }, "Lote que já saiu da fazenda (linha cinza na aba Lotes)"],
  ];
  leg.forEach(([cor, txt]) => {
    const c = ws.getCell(`B${linha}`);
    c.fill = fill(cor.bg);
    c.border = borda(cor.fg);
    ws.mergeCells(`C${linha}:I${linha}`);
    const t = ws.getCell(`C${linha}`);
    t.value = txt;
    t.font = { name: FONTE, size: 10, color: { argb: COR.texto } };
    t.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(linha).height = 18;
    linha++;
  });
  linha++;
  ws.mergeCells(`B${linha}:I${linha}`);
  const n = ws.getCell(`B${linha}`);
  n.value = "Detalhes nas outras abas: Lotes, Entradas, Saídas, Pesagens (todas, com GMD) e Sanidade.";
  n.font = { name: FONTE, size: 9, italic: true, color: { argb: COR.apagado } };
  return ws;
}

// ------------------------------------------------------------ montar e baixar
export function montarPlanilha(db) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema de Gado · " + FAZENDA;
  wb.created = new Date();
  const geradaEm = agora();
  abaResumo(wb, db, geradaEm);
  for (const [nome, linhas] of Object.entries(linhasPlanilha(db))) abaTabela(wb, nome, linhas, geradaEm);
  return wb;
}

export async function baixarPlanilha(db) {
  const buf = await montarPlanilha(db).xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gado-fazenda-sao-joao-${hojeISO()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
