// Gera a planilha Excel (.xlsx) com TUDO que está no sistema, já formatada.
// Abas: Resumo, Lotes (com custos), Entradas, Saídas (fechamento), Pesagens, Sanidade,
// Pastos, Mudanças de pasto, Trato, Dietas, Preços e Custos.
import ExcelJS from "exceljs";
import {
  hojeISO, calcGmd, pesoEstimadoEm, modelo, fechamento, precoMl, dietaEm, vigente,
} from "./calc.js";

let FAZENDA = "Fazenda";

// "AAAA-MM-DD" → data do Excel (sem problema de fuso).
const dt = (iso) => (iso ? new Date(iso + "T12:00:00") : null);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
const sexo = (s) => (s === "M" ? "Macho" : "Fêmea");
const mesBr = (chave) => { const [a, m] = chave.split("-"); return `${m}/${a}`; };
function somaMes(chave, n) {
  const [a, m] = chave.split("-").map(Number), t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

// ------------------------------------------------------------ dados (uma linha por registro)
export function linhasPlanilha(db) {
  const hoje = hojeISO();
  const m = modelo(db, hoje);
  const loteById = Object.fromEntries(db.lotes.map((l) => [l.id, l]));
  const nome = (id) => loteById[id]?.numero ?? "(lote excluído)";
  const nomeDe = (col, id) => (db[col] || []).find((x) => x.id === id)?.nome ?? "";
  const porData = (a, b) => a.data.localeCompare(b.data);
  const situacao = (l) => (l.ativo ? "Ativo" : l.apartadoEm ? "Apartado" : "Saiu");

  const lotesOrd = [...db.lotes].sort((a, b) => a.dataEntrada.localeCompare(b.dataEntrada) || a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }));
  const Lotes = lotesOrd.map((l) => {
    const r = m.lote(l.id), pai = l.origemId ? loteById[l.origemId] : null;
    // Lote apartado passou os custos para os lotes derivados: aqui fica em branco para não somar duas vezes.
    const c = l.apartadoEm ? null : r.custos;
    return {
      Lote: l.numero,
      Situação: situacao(l),
      Cabeças: l.quantidade,
      Sexo: sexo(l.sexo),
      Raça: l.raca || "",
      "Origem do lote": pai ? "Apartação do " + pai.numero : l.origem || "",
      "Data de entrada": dt(l.dataEntrada),
      "Peso de entrada (kg)": l.pesoEntrada,
      "Peso atual ou final (kg)": r1(r.pesoFinal),
      "GMD estimado (kg/dia)": r3(r.gmdEst),
      "GMD real da última pesagem": r3(r.gmdReal),
      "Dias na fazenda": r.dias,
      "Pasto atual": l.ativo ? nomeDe("pastos", r.pastoId) : "",
      "Dieta atual": l.ativo && r.dietaId ? nomeDe("dietas", r.dietaId) : "",
      "Aquisição (R$)": c ? r2(c.aquisicao) : null,
      "Pasto (R$)": c ? r2(c.pasto) : null,
      "Trato (R$)": c ? r2(c.trato) : null,
      "Sanidade (R$)": c ? r2(c.sanidade) : null,
      "Custos fixos (R$)": c ? r2(c.fixos) : null,
      "Custos gerais (R$)": c ? r2(c.gerais) : null,
      "Custo total (R$)": c ? r2(r.total) : null,
      "Custo por cabeça (R$/cab)": c && l.quantidade ? r2(r.total / l.quantidade) : null,
      "Custo de hoje (R$)": l.ativo ? r2(r.hoje.total) : null,
      Observações: l.obs || "",
    };
  });

  const Entradas = lotesOrd.filter((l) => !l.origemId).map((l) => ({
    "Data de entrada": dt(l.dataEntrada),
    Lote: l.numero,
    Cabeças: l.quantidade,
    Sexo: sexo(l.sexo),
    Raça: l.raca || "",
    "Idade (meses)": l.idadeMeses ?? null,
    "Peso médio de entrada (kg)": l.pesoEntrada,
    "Peso total de entrada (kg)": Math.round(l.pesoEntrada * l.quantidade),
    "Custo do kg (R$/kg)": l.custoKg ?? null,
    "Comissão (R$)": l.custoKg != null ? l.comissao || 0 : null,
    "Frete (R$)": l.custoKg != null ? l.frete || 0 : null,
    "Custo de aquisição (R$)": l.custoKg != null ? r2(l.quantidade * l.pesoEntrada * l.custoKg + (l.comissao || 0) + (l.frete || 0)) : null,
    "GMD estimado (kg/dia)": r3(l.gmdEst),
    "Origem do lote": l.origem || "",
    Observações: l.obs || "",
  }));

  const Saidas = [...db.saidas].sort(porData).map((s) => {
    const r = m.lote(s.loteId), f = r && s.tipo ? fechamento(r, s) : null;
    return {
      "Data de saída": dt(s.data),
      Lote: nome(s.loteId),
      Tipo: s.tipo === "abate" ? "Abate" : s.tipo === "vivo" ? "Venda viva" : s.motivo || "Saída",
      "Destino / comprador": s.destino || "",
      Cabeças: s.quantidade ?? (r ? r.lote.quantidade : null),
      "Peso médio de saída (kg)": s.peso ?? null,
      "Peso total de saída (kg)": f ? Math.round(f.pesoTotal) : null,
      "Dias na fazenda": r ? r.dias : null,
      "GMD do período (kg/dia)": f ? r3(f.gmdPeriodo) : null,
      "Rendimento de carcaça (%)": f && s.tipo === "abate" ? r1(f.rend) : null,
      "Rendimento usado": f && s.tipo === "abate" ? (f.rendReal ? "Real" : "Esperado") : "",
      "Arrobas (@)": f ? r1(f.arrobas) : null,
      "Preço da arroba (R$/@)": s.precoArroba ?? null,
      "Preço do kg vivo (R$/kg)": s.precoKg ?? null,
      "Receita (R$)": f ? r2(f.receita) : null,
      "Custo total (R$)": r ? r2(r.total) : null,
      "Custo por dia com a compra (R$/dia)": f ? r2(f.custoDia) : null,
      "Custo por dia só produção (R$/dia)": f ? r2(f.custoDiaProd) : null,
      "Resultado (R$)": f ? r2(f.resultado) : null,
      "Resultado por cabeça (R$/cab)": f ? r2(f.resultadoCab) : null,
      Observação: s.obs || "",
    };
  });

  const Pesagens = [...db.pesagens].sort((a, b) => porData(a, b) || nome(a.loteId).localeCompare(nome(b.loteId))).map((p) => {
    const l = loteById[p.loteId];
    const c = l ? calcGmd(db, l, p) : null;
    const est = l ? pesoEstimadoEm(db, l, p.data, p.id).peso : null;
    return {
      Data: dt(p.data),
      Lote: nome(p.loteId),
      "Peso médio (kg/animal)": p.peso,
      "Peso estimado na data (kg)": r1(est),
      "Diferença balança − estimado (kg)": est != null ? r1(p.peso - est) : null,
      "Comparado com": c ? c.ref.tipo : "",
      "Data anterior": c ? dt(c.ref.data) : null,
      "Peso anterior (kg)": c ? c.ref.peso : null,
      Dias: c ? c.dias : null,
      "Ganho (kg)": c ? r1(c.ganho) : null,
      "GMD real (kg/dia)": c ? r3(c.gmd) : null,
    };
  });

  const Sanidade = [...db.sanidade].sort(porData).map((s) => {
    const l = loteById[s.loteId], med = s.medId ? (db.meds || []).find((x) => x.id === s.medId) : null;
    const ml = s.ml != null ? s.ml : s.doseMl != null && l ? s.doseMl * l.quantidade : null;
    return {
      Data: dt(s.data),
      Lote: nome(s.loteId),
      Tipo: s.tipo === "tratamento" ? "Tratamento" : "Protocolo",
      "Doença tratada": s.doenca || "",
      Medicamento: med ? med.nome : s.procedimento || "",
      "Total aplicado (ml)": r1(ml),
      "ml por cabeça": s.mlCab != null ? r1(s.mlCab) : s.doseMl ?? null,
      "Animais tratados": s.animais ?? null,
      "Preço na data (R$/ml)": med ? r3(precoMl(med, s.data)) : null,
      "Custo (R$)": med && ml != null ? r2(ml * precoMl(med, s.data)) : null,
    };
  });

  const Pastos = m.pastos.map((p) => {
    const v = vigente(p.pasto.precos, hoje);
    return {
      Pasto: p.pasto.nome,
      Capim: p.pasto.capim || "",
      "Área (ha)": p.pasto.area,
      "Custo (R$/ha/ano)": v ? v.valor : null,
      "Custo por dia (R$/dia)": r2(p.custoDia),
      "Lotes no pasto": p.lotes.map((r) => r.lote.numero).join(", "),
      Cabeças: p.cabecas,
      "Lotação (cab/ha)": p.lotacao == null ? null : r2(p.lotacao),
      "Ocupado desde": p.desde ? dt(p.desde) : null,
      "Pasto ocioso em 12 meses (R$)": r2(p.ocioso),
    };
  });

  const Movs = [...(db.movs || [])].sort(porData).map((x) => ({
    Data: dt(x.data),
    Lote: nome(x.loteId),
    Pasto: nomeDe("pastos", x.pastoId) || "(sem pasto)",
    Piquete: x.piquete || "",
    Tipo: x.inicial ? "Entrada" : "Mudança",
  }));

  const Trato = m.ativos.filter((r) => r.consumo).map((r) => ({
    Lote: r.lote.numero,
    Dieta: nomeDe("dietas", r.dietaId),
    Cabeças: r.lote.quantidade,
    "Peso estimado (kg)": r1(r.peso),
    "Consumo (% do peso vivo)": r.consumo.pv,
    "Consumo do lote (kg/dia)": r1(r.consumo.kgLote),
    "Consumo por cabeça (kg/dia)": r2(r.consumo.kgCab),
    "Custo da dieta (R$/kg)": r3(r.consumo.custoKg),
    "Custo de trato hoje (R$)": r2(r.hoje.trato),
  }));

  const Dietas = [];
  for (const d of [...(db.dietas || [])].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
    const v = dietaEm(db, d, hoje);
    if (!v) continue;
    for (const it of v.itens) {
      Dietas.push({
        Dieta: d.nome,
        "Composição desde": dt(v.desde),
        "Consumo (% do peso vivo)": v.pv,
        Ingrediente: it.nome,
        "Na mistura (%)": it.pct,
        "Preço hoje (R$/t)": it.rT,
        "Custo da dieta (R$/kg)": r3(v.custoKg),
        "Matéria seca da dieta (%)": r1(v.ms),
      });
    }
  }

  const Precos = [];
  const hist = (tipo, lista, linha) => {
    for (const x of [...(lista || [])].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
      for (const p of [...(x.precos || [])].sort((a, b) => a.desde.localeCompare(b.desde))) Precos.push({ Tipo: tipo, Nome: x.nome, "Vale desde": dt(p.desde), ...linha(p) });
    }
  };
  hist("Medicamento", db.meds, (p) => ({ Preço: `R$ ${p.preco.toFixed(2).replace(".", ",")} por ${p.ml} ml`, "Preço por unidade (R$)": r3(p.ml > 0 ? p.preco / p.ml : 0), Unidade: "ml" }));
  hist("Ingrediente", db.ingredientes, (p) => ({ Preço: `R$ ${p.valor.toFixed(2).replace(".", ",")} por tonelada`, "Preço por unidade (R$)": r3(p.valor / 1000), Unidade: "kg" }));
  hist("Pasto", db.pastos, (p) => ({ Preço: `R$ ${p.valor.toFixed(2).replace(".", ",")} por hectare por ano`, "Preço por unidade (R$)": r3(p.valor / 365), Unidade: "hectare por dia" }));

  const Custos = [...(db.custos || [])].sort((a, b) => (a.mes || a.data).localeCompare(b.mes || b.data)).map((c) => {
    const fixo = c.tipo === "fixo", n = Math.max(1, c.meses || 1);
    return {
      Tipo: fixo ? "Custo fixo" : "Custo geral",
      Descrição: c.descricao,
      Categoria: fixo ? c.categoria || "Outro" : "Custos gerais",
      "Valor lançado (R$)": c.valor,
      "Valor por mês (R$)": fixo ? c.valor : r2(c.valor / n),
      "Primeiro mês": mesBr(fixo ? c.mes : c.data.slice(0, 7)),
      "Último mês": fixo ? (!c.recorrente ? mesBr(c.mes) : c.ate ? mesBr(c.ate) : "em aberto") : mesBr(somaMes(c.data.slice(0, 7), n - 1)),
      "Meses de diluição": fixo ? null : n,
    };
  });

  return { Lotes, Entradas, Saídas: Saidas, Pesagens, Sanidade, Pastos, "Mudanças de pasto": Movs, Trato, Dietas, Preços: Precos, Custos };
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
  if (/R\$\/(kg|ml|t|@|ha|cab|dia)|por unidade/.test(h)) return { fmt: /R\$\/(kg|ml)|por unidade/.test(h) ? '"R$" #,##0.000' : '"R$" #,##0.00', al: "right", w: 15 };
  if (/R\$/.test(h)) return { fmt: '"R$" #,##0.00;[Red]-"R$" #,##0.00', al: "right", w: 16, total: "soma" };
  if (/\(%|%\)/.test(h)) return { fmt: "0.0", al: "center", w: 13 };
  if (/\(@\)/.test(h)) return { fmt: "#,##0.0", al: "right", w: 13, total: "soma" };
  if (/\(ha\)/.test(h)) return { fmt: "#,##0.0", al: "right", w: 11, total: "soma" };
  if (/cab\/ha/.test(h)) return { fmt: "0.00", al: "center", w: 12 };
  if (/ml por|Animais|Meses/.test(h)) return { fmt: "#,##0.##", al: "center", w: 11 };
  if (/kg\/dia\)/.test(h) && !/GMD/.test(h)) return { fmt: "#,##0.0", al: "right", w: 14, total: "soma" };
  if (/mês$/.test(h)) return { al: "center", w: 12 };
  if (/^Data|Data |desde/.test(h)) return { fmt: "dd/mm/yyyy", al: "center", w: 13 };
  if (/GMD/.test(h)) return { fmt: "0.000", al: "center", w: 13, total: "media" };
  if (/Peso total/.test(h)) return { fmt: "#,##0", al: "right", w: 15, total: "soma" };
  if (/Total aplicado/.test(h)) return { fmt: "#,##0.0", al: "right", w: 13, total: "soma" };
  if (/Dose/.test(h)) return { fmt: "#,##0.0", al: "right", w: 12 };
  if (/Ganho/.test(h)) return { fmt: "+#,##0.0;-#,##0.0;0.0", al: "right", w: 13, total: "media" };
  if (/\(kg/.test(h)) return { fmt: "#,##0.0", al: "right", w: 13, total: "media" };
  if (h === "Cabeças") return { fmt: "#,##0", al: "center", w: 10, total: "soma" };
  if (/^Dias/.test(h)) return { fmt: "0", al: "center", w: 10, total: "media" };
  if (/Nº|Idade/.test(h)) return { fmt: "0", al: "center", w: 11 };
  if (/^Lote$|Situação|Sexo|Motivo|Unidade|Rendimento usado/.test(h)) return { al: "center", w: 12 };
  if (/^Tipo$|Piquete|Categoria/.test(h)) return { al: "center", w: 14 };
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
  Lotes: "Todos os lotes, com peso, GMD e o custo acumulado de cada um (compra, pasto, trato, sanidade e rateios).",
  Entradas: "Cada lote comprado, com peso, quantidade e custo de aquisição na chegada.",
  Saídas: "Fechamento de cada saída: arrobas, receita, custo total, custo por dia e resultado do lote.",
  Pesagens: "Todas as pesagens. Compara a balança com o peso estimado e calcula o GMD real.",
  Sanidade: "Protocolos e tratamentos, com o custo pelo preço do medicamento que valia na data.",
  Pastos: "Situação de cada pasto hoje: lotes, lotação, custo por dia e pasto ocioso.",
  "Mudanças de pasto": "Por onde cada lote passou: entrada e mudanças de pasto.",
  Trato: "Quanto cada lote ativo precisa no cocho hoje e quanto custa.",
  Dietas: "Composição atual de cada dieta, com o preço de hoje dos ingredientes.",
  Preços: "Histórico de preços de medicamentos, ingredientes e pastos, com a data em que cada um começou a valer.",
  Custos: "Custos fixos mensais e custos gerais diluídos em meses, rateados por cabeça por dia.",
};
const COR_ABA = {
  Lotes: COR.verde, Entradas: "FF3F7A4D", Saídas: COR.terra, Pesagens: COR.amarelo, Sanidade: "FF2F6F8F",
  Pastos: "FF46A05E", "Mudanças de pasto": "FF46A05E", Trato: "FFF4B92F", Dietas: "FFF4B92F", Preços: COR.apagado, Custos: COR.vermelho,
};
const CONGELA = (nome) => (nome === "Preços" || nome === "Custos" ? 2 : nome === "Pastos" || nome === "Trato" || nome === "Dietas" ? 1 : 2);

/** Aba de tabela: título, cabeçalho colorido, linhas alternadas, filtros, painel congelado e totais. */
function abaTabela(wb, nome, linhas, geradaEm) {
  const ws = wb.addWorksheet(nome, {
    properties: { tabColor: { argb: COR_ABA[nome] } },
    views: [{ state: "frozen", xSplit: linhas.length ? CONGELA(nome) : 0, ySplit: LINHA_CAB, showGridLines: false, zoomScale: 110 }],
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
    const saiu = obj["Situação"] != null && obj["Situação"] !== "Ativo";
    const fundo = saiu ? COR.cinza : k % 2 ? COR.zebra : COR.papel;
    let maxLinhas = 1;
    cab.forEach((h, i) => {
      const c = r.getCell(i + 1);
      const v = obj[h];
      c.value = v === "" ? null : v;
      const spec = cols[i];
      c.font = { name: FONTE, size: 10, color: { argb: saiu ? COR.apagado : COR.texto }, bold: h === "Lote" || /^(Custo total|Resultado) \(R\$\)$/.test(h) };
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

  const m = modelo(db, hojeISO()), fz = m.fazenda;
  const r = { ...fz, lotesSaidos: fz.lotesEncerrados };
  const ativos = db.lotes.filter((l) => l.ativo);
  const custoAtivos = m.ativos.reduce((t, x) => t + x.total, 0);
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
    ["Lotes encerrados", r.lotesSaidos, "0", "saídas e apartações"],
  ]);
  secao("Custos hoje");
  cartoes([
    ["Custo do dia da fazenda", r2(fz.custoDia), '"R$" #,##0.00', "pasto, trato e rateios", true],
    ["Custo por cabeça por dia", r2(fz.custoCabDia), '"R$" #,##0.00', "média do rebanho", true],
    ["Custo nos lotes ativos", Math.round(custoAtivos), '"R$" #,##0', "acumulado, com a compra", true],
    ["Pastos ocupados", fz.pastosOcupados, "0", `${fz.pastosVazios} ${fz.pastosVazios === 1 ? "vazio" : "vazios"}`, true],
  ]);
  secao("Registros no sistema");
  cartoes([
    ["Lotes cadastrados", db.lotes.length, "0", "entradas"],
    ["Cabeças que saíram", cabSaidas, "#,##0", `em ${db.saidas.length} ${db.saidas.length === 1 ? "saída" : "saídas"}`],
    ["Pesagens", db.pesagens.length, "0", "registradas"],
    ["Manejos sanitários", db.sanidade.length, "0", "protocolos e tratamentos"],
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
      ["Lote", "Raça", "Sexo", "Cabeças", "Peso estimado (kg)", "Último GMD real (kg/dia)", "Dias na fazenda", "Custo total (R$)"],
      ord.map((l) => {
        const x = m.lote(l.id);
        return [l.numero, l.raca || null, sexo(l.sexo), l.quantidade, r1(x.peso), r3(x.gmdReal), x.dias, r2(x.total)];
      }),
      [{ bold: true }, { al: "left" }, {}, { fmt: "#,##0" }, { fmt: "#,##0.0" }, { fmt: "0.000", gmd: true }, { fmt: "0" }, { fmt: '"R$" #,##0.00' }],
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
    [{ bg: COR.terraClara, fg: COR.terra }, "Lote encerrado: saiu da fazenda ou foi apartado (linha cinza na aba Lotes)"],
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
  n.value = "Detalhes nas outras abas: Lotes (custos), Entradas, Saídas (fechamento), Pesagens, Sanidade, Pastos, Trato, Dietas, Preços e Custos.";
  n.font = { name: FONTE, size: 9, italic: true, color: { argb: COR.apagado } };
  return ws;
}

// ------------------------------------------------------------ montar e baixar
export function montarPlanilha(db, nomeFazenda) {
  FAZENDA = nomeFazenda || "Fazenda";
  const wb = new ExcelJS.Workbook();
  wb.creator = "Lote Certo · " + FAZENDA;
  wb.created = new Date();
  const geradaEm = agora();
  abaResumo(wb, db, geradaEm);
  for (const [nome, linhas] of Object.entries(linhasPlanilha(db))) abaTabela(wb, nome, linhas, geradaEm);
  return wb;
}

export async function baixarPlanilha(db, nomeFazenda) {
  const buf = await montarPlanilha(db, nomeFazenda).xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = String(nomeFazenda || "fazenda").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "fazenda";
  a.download = `lote-certo-${slug}-${hojeISO()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
