// Contas do sistema. Funções puras: recebem os dados e devolvem números.
// Usadas pelas telas e pela planilha Excel, para as duas mostrarem sempre o mesmo resultado.

export function hojeISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** Dias entre duas datas "AAAA-MM-DD". */
export function dias(de, ate) {
  return Math.round((Date.parse(ate + "T12:00:00Z") - Date.parse(de + "T12:00:00Z")) / 864e5);
}

const porData = (a, b) => a.data.localeCompare(b.data);

export function pesagensDoLote(db, loteId) {
  return db.pesagens.filter((p) => p.loteId === loteId).sort(porData);
}

/** Peso atual = última pesagem; sem pesagem, o peso de entrada. */
export function pesoAtual(db, lote) {
  const p = pesagensDoLote(db, lote.id);
  return p.length
    ? { peso: p[p.length - 1].peso, data: p[p.length - 1].data, origem: "pesagem" }
    : { peso: lote.pesoEntrada, data: lote.dataEntrada, origem: "entrada" };
}

/** Referência para o GMD de uma pesagem: a última pesagem antes da data, ou a entrada. */
export function referenciaAnterior(db, lote, data, ignorarId) {
  const p = pesagensDoLote(db, lote.id).filter((x) => x.data < data && x.id !== ignorarId);
  return p.length
    ? { peso: p[p.length - 1].peso, data: p[p.length - 1].data, tipo: "Última pesagem" }
    : { peso: lote.pesoEntrada, data: lote.dataEntrada, tipo: "Peso de entrada" };
}

/** GMD = (peso novo − peso anterior) ÷ dias entre as datas. */
export function calcGmd(db, lote, pesagem) {
  const ref = referenciaAnterior(db, lote, pesagem.data, pesagem.id);
  const d = dias(ref.data, pesagem.data);
  const ganho = pesagem.peso - ref.peso;
  return { ref, dias: d, ganho, gmd: d > 0 ? ganho / d : null };
}

export function ultimoGmd(db, lote) {
  const p = pesagensDoLote(db, lote.id);
  return p.length ? calcGmd(db, lote, p[p.length - 1]).gmd : null;
}

export function saidaDoLote(db, loteId) {
  return db.saidas.find((s) => s.loteId === loteId) || null;
}

export function resumo(db) {
  const ativos = db.lotes.filter((l) => l.ativo);
  const cabecas = ativos.reduce((s, l) => s + l.quantidade, 0);
  const machos = ativos.filter((l) => l.sexo === "M").reduce((s, l) => s + l.quantidade, 0);
  const pesoTotal = ativos.reduce((s, l) => s + pesoAtual(db, l).peso * l.quantidade, 0);
  const comGmd = ativos.map((l) => [ultimoGmd(db, l), l.quantidade]).filter(([g]) => g != null);
  const cabGmd = comGmd.reduce((s, [, q]) => s + q, 0);
  return {
    cabecas,
    machos,
    femeas: cabecas - machos,
    lotesAtivos: ativos.length,
    lotesSaidos: db.lotes.length - ativos.length,
    pesoTotal,
    pesoMedio: cabecas ? pesoTotal / cabecas : null,
    gmdMedio: cabGmd ? comGmd.reduce((s, [g, q]) => s + g * q, 0) / cabGmd : null,
  };
}
