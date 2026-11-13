// Contas do sistema. Funções puras: recebem os dados e devolvem números.
// Usadas pelas telas e pela planilha Excel, para as duas mostrarem sempre o mesmo resultado.
//
// Regras principais (ver o documento de requisitos):
//  - Preço com vigência: cada preço tem uma data de início e vale só dali para frente.
//    O custo de um lançamento usa o preço que valia na DATA do lançamento.
//  - Medido vence estimado: o peso da balança vira a referência; entre pesagens o peso é
//    estimado pelo GMD estimado do lote.
//  - Custos do lote = aquisição + pasto + trato + sanidade + custos fixos + custos gerais,
//    somados dia a dia. Lote derivado de apartação herda a parte dele (por cabeça) do lote de origem.

const DIA = 864e5;

export function hojeISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** Número do dia (inteiro) de uma data "AAAA-MM-DD". */
export const nDia = (iso) => Math.floor(Date.parse(iso + "T12:00:00Z") / DIA);
export const isoDia = (n) => new Date(n * DIA).toISOString().slice(0, 10);

/** Dias entre duas datas "AAAA-MM-DD". */
export const dias = (de, ate) => nDia(ate) - nDia(de);

const porData = (a, b) => a.data.localeCompare(b.data) || String(a.criadoEm || "").localeCompare(String(b.criadoEm || ""));
const mesDe = (iso) => iso.slice(0, 7);
function somaMes(chave, n) {
  const [a, m] = chave.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
const diasNoMes = (chave) => { const [a, m] = chave.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };

/** Preço em vigor numa data: o último com início até a data. Antes do primeiro preço, vale o primeiro. */
export function vigente(lista, data) {
  if (!lista || !lista.length) return null;
  const ord = [...lista].sort((a, b) => a.desde.localeCompare(b.desde));
  let v = ord[0];
  for (const p of ord) if (p.desde <= data) v = p;
  return v;
}

// ---------------------------------------------------------------- pesagens e GMD
export function pesagensDoLote(db, loteId) {
  return db.pesagens.filter((p) => p.loteId === loteId).sort(porData);
}

/** Referência de peso antes de uma data: a última pesagem antes dela, ou a entrada. */
export function referenciaAnterior(db, lote, data, ignorarId) {
  const p = pesagensDoLote(db, lote.id).filter((x) => x.data < data && x.id !== ignorarId);
  return p.length
    ? { peso: p[p.length - 1].peso, data: p[p.length - 1].data, tipo: "Última pesagem" }
    : { peso: lote.pesoEntrada, data: lote.dataEntrada, tipo: "Peso de entrada" };
}

/** GMD real = (peso novo − peso anterior) ÷ dias entre as datas. */
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

/** GMD estimado em vigor numa data (o da entrada, ou o último ajuste até a data). */
export function gmdEstimadoEm(db, lote, data) {
  const aj = (db.gmds || []).filter((g) => g.loteId === lote.id && g.data <= data).sort(porData);
  return aj.length ? aj[aj.length - 1].gmd : (lote.gmdEst || 0);
}

/** Peso estimado numa data, a partir da última referência ANTES da data (pesagem ou entrada). */
export function pesoEstimadoEm(db, lote, data, ignorarId) {
  const ref = referenciaAnterior(db, lote, data, ignorarId);
  const aj = (db.gmds || []).filter((g) => g.loteId === lote.id).sort(porData);
  let peso = ref.peso;
  const fim = nDia(data);
  let i = 0, gmd = lote.gmdEst || 0;
  for (let d = nDia(ref.data) + 1; d <= fim; d++) {
    const iso = isoDia(d);
    while (i < aj.length && aj[i].data <= iso) gmd = aj[i++].gmd;
    peso += gmd;
  }
  return { peso, ref };
}

export function saidaDoLote(db, loteId) {
  return db.saidas.find((s) => s.loteId === loteId) || null;
}

/** Lote que deu origem a toda a cadeia de apartações. */
export function loteRaiz(db, lote) {
  let l = lote, n = 0;
  while (l && l.origemId && n++ < 50) {
    const pai = db.lotes.find((x) => x.id === l.origemId);
    if (!pai) break;
    l = pai;
  }
  return l;
}

// ---------------------------------------------------------------- catálogos
/** R$ por ml de um medicamento numa data. */
export function precoMl(med, data) {
  const v = med && vigente(med.precos, data);
  return v && v.ml > 0 ? v.preco / v.ml : 0;
}

/** Dieta numa data: % do peso vivo, custo por kg, % de matéria seca e os ingredientes com preço. */
export function dietaEm(db, dieta, data) {
  const v = dieta && vigente(dieta.versoes, data);
  if (!v) return null;
  let custoKg = 0, ms = 0;
  const itens = (v.itens || []).map((it) => {
    const ing = (db.ingredientes || []).find((x) => x.id === it.ingId);
    const p = ing ? vigente(ing.precos, data) : null;
    const rKg = p ? p.valor / 1000 : 0;
    custoKg += (it.pct / 100) * rKg;
    ms += (it.pct / 100) * (ing ? ing.ms || 0 : 0);
    return { ...it, nome: ing ? ing.nome : "(ingrediente excluído)", rKg, rT: p ? p.valor : 0, parte: (it.pct / 100) * rKg };
  });
  return { pv: v.pv || 0, custoKg, ms, itens, desde: v.desde };
}

// ---------------------------------------------------------------- modelo completo
const ZERO = () => ({ aquisicao: 0, pasto: 0, trato: 0, sanidade: 0, fixos: 0, gerais: 0 });
const somar = (a, b, k = 1) => { for (const c in a) a[c] += (b[c] || 0) * k; return a; };
export const totalDe = (c) => c.aquisicao + c.pasto + c.trato + c.sanidade + c.fixos + c.gerais;
export const CATEGORIAS = [["aquisicao", "Aquisição"], ["pasto", "Pasto"], ["trato", "Trato"], ["sanidade", "Sanidade"], ["fixos", "Custos fixos"], ["gerais", "Custos gerais"]];

function agrupar(lista, chave) {
  const m = new Map();
  for (const x of lista || []) { const k = x[chave]; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  for (const v of m.values()) v.sort(porData);
  return m;
}
const comDia = (precos) => [...(precos || [])].sort((a, b) => a.desde.localeCompare(b.desde)).map((p) => ({ ...p, d: nDia(p.desde) }));
function vigN(lista, d) {
  if (!lista.length) return null;
  let v = lista[0];
  for (const p of lista) { if (p.d <= d) v = p; else break; }
  return v;
}

/**
 * Calcula tudo de uma vez para uma data ("hoje"): situação de cada lote, de cada pasto e da fazenda.
 * Devolve { lote(id), lotes, ativos, pastos, fazenda, mensal(chave) }.
 */
export function modelo(db, hoje = hojeISO()) {
  const H = nDia(hoje);
  const porId = new Map(db.lotes.map((l) => [l.id, l]));
  const saidas = new Map(db.saidas.map((s) => [s.loteId, s]));
  const pesG = agrupar(db.pesagens, "loteId"), movG = agrupar(db.movs, "loteId"), traG = agrupar(db.tratos, "loteId");
  const gmdG = agrupar(db.gmds, "loteId"), sanG = agrupar(db.sanidade, "loteId");

  const pastos = new Map((db.pastos || []).map((p) => [p.id, { ...p, precosN: comDia(p.precos) }]));
  const meds = new Map((db.meds || []).map((m) => [m.id, m]));
  const ings = new Map((db.ingredientes || []).map((i) => [i.id, { ...i, precosN: comDia(i.precos) }]));
  const dietas = new Map((db.dietas || []).map((x) => [x.id, { ...x, versoesN: comDia(x.versoes) }]));

  // Período de cada lote: do dia da entrada até a saída, a apartação ou hoje.
  const per = new Map();
  for (const l of db.lotes) {
    const ini = nDia(l.dataEntrada);
    const sai = saidas.get(l.id);
    const fimISO = sai ? sai.data : l.apartadoEm || null;
    const fim = Math.max(ini, fimISO ? nDia(fimISO) : H);
    per.set(l.id, { ini, fim, encerrado: !!fimISO, sai });
  }

  // Linha do tempo: valor em vigor em cada dia (pasto, dieta, GMD estimado).
  const cursor = (eventos) => {
    const ev = (eventos || []).map((e) => ({ e, d: nDia(e.data) }));
    let i = 0, atual = null;
    return (d) => { while (i < ev.length && ev[i].d <= d) atual = ev[i++].e; return atual; };
  };

  // 1ª passada: quantas cabeças em cada pasto e na fazenda, dia a dia.
  const cabPasto = new Map(), cabFaz = new Map();
  for (const l of db.lotes) {
    const { ini, fim, encerrado } = per.get(l.id);
    const ultimo = encerrado ? fim - 1 : fim; // lote ativo conta também no dia de hoje
    const pastoEm = cursor(movG.get(l.id));
    for (let d = ini; d <= ultimo; d++) {
      cabFaz.set(d, (cabFaz.get(d) || 0) + l.quantidade);
      const m = pastoEm(d);
      if (m && m.pastoId) {
        let mp = cabPasto.get(m.pastoId);
        if (!mp) cabPasto.set(m.pastoId, (mp = new Map()));
        mp.set(d, (mp.get(d) || 0) + l.quantidade);
      }
    }
  }

  // Custos fixos e gerais por dia da fazenda, mês a mês.
  const cacheMes = new Map();
  function mensal(chave) {
    let r = cacheMes.get(chave);
    if (r) return r;
    let fixo = 0, geral = 0;
    const cat = {};
    for (const c of db.custos || []) {
      let v = 0;
      if (c.tipo === "fixo") {
        if (c.mes === chave || (c.recorrente && c.mes <= chave && (!c.ate || chave <= c.ate))) v = c.valor;
        fixo += v;
      } else {
        const m0 = mesDe(c.data), n = Math.max(1, c.meses || 1);
        if (chave >= m0 && chave < somaMes(m0, n)) v = c.valor / n;
        geral += v;
      }
      if (v) { const k = c.tipo === "fixo" ? c.categoria || "Outro" : "Custos gerais"; cat[k] = (cat[k] || 0) + v; }
    }
    const nd = diasNoMes(chave);
    r = { fixo, geral, fixoDia: fixo / nd, geralDia: geral / nd, dias: nd, categorias: cat };
    cacheMes.set(chave, r);
    return r;
  }
  const custoPastoDia = (p, d) => { const v = vigN(p.precosN, d); return v ? (v.valor * (p.area || 0)) / 365 : 0; };
  function dietaNoDia(dt, d) {
    const v = vigN(dt.versoesN, d);
    if (!v) return null;
    let custoKg = 0;
    for (const it of v.itens || []) {
      const ing = ings.get(it.ingId), p = ing ? vigN(ing.precosN, d) : null;
      if (p) custoKg += (it.pct / 100) * (p.valor / 1000);
    }
    return { pv: v.pv || 0, custoKg };
  }

  // 2ª passada: cada lote, dia a dia.
  const res = new Map();
  for (const l of db.lotes) {
    const { ini, fim, encerrado, sai } = per.get(l.id);
    const q = l.quantidade;
    const pastoEm = cursor(movG.get(l.id)), tratoEm = cursor(traG.get(l.id)), gmdEm = cursor(gmdG.get(l.id));
    const pes = pesG.get(l.id) || [];
    const pesoNoDia = new Map(pes.map((p) => [nDia(p.data), p]));
    const proprio = ZERO();
    proprio.aquisicao = l.custoKg != null ? q * l.pesoEntrada * l.custoKg + (l.comissao || 0) + (l.frete || 0) : 0;
    for (const s of sanG.get(l.id) || []) {
      if (s.medId && meds.has(s.medId)) proprio.sanidade += (s.ml || 0) * precoMl(meds.get(s.medId), s.data);
    }
    let peso = l.pesoEntrada, ref = { peso: l.pesoEntrada, data: l.dataEntrada, origem: "entrada" };
    let gmdEst = l.gmdEst || 0, mov = null, tr = null, hojeC = { pasto: 0, trato: 0, fixos: 0, gerais: 0 }, cons = null;
    for (let d = ini; d <= fim; d++) {
      const aj = gmdEm(d);
      gmdEst = aj ? aj.gmd : (l.gmdEst || 0);
      const pd = pesoNoDia.get(d);
      if (pd) { peso = pd.peso; ref = { peso: pd.peso, data: pd.data, origem: "pesagem" }; }
      else if (d > ini) peso += gmdEst;
      if (d === fim && encerrado) break; // no dia em que saiu, o lote não custa mais
      mov = pastoEm(d); tr = tratoEm(d);
      const dia = { pasto: 0, trato: 0, fixos: 0, gerais: 0 };
      const p = mov && mov.pastoId ? pastos.get(mov.pastoId) : null;
      if (p) { const cab = cabPasto.get(p.id)?.get(d) || q; dia.pasto = (custoPastoDia(p, d) / cab) * q; }
      cons = null;
      const dt = tr && tr.dietaId ? dietas.get(tr.dietaId) : null;
      if (dt) {
        const v = dietaNoDia(dt, d);
        if (v) {
          const kgCab = (peso * v.pv) / 100;
          dia.trato = kgCab * q * v.custoKg;
          cons = { pv: v.pv, kgCab, kgLote: kgCab * q, custoKg: v.custoKg };
        }
      }
      const m = mensal(isoDia(d).slice(0, 7)), cf = cabFaz.get(d) || q;
      dia.fixos = (m.fixoDia / cf) * q;
      dia.gerais = (m.geralDia / cf) * q;
      if (d < fim) somar(proprio, dia); else hojeC = dia; // hoje ainda não entrou na soma
    }
    res.set(l.id, {
      lote: l, ini, fim, encerrado, saida: sai || null,
      peso, ref, gmdEst, gmdReal: ultimoGmd(db, l),
      pastoId: mov ? mov.pastoId : null, piquete: mov ? mov.piquete || "" : "", desdePasto: mov ? mov.data : null,
      dietaId: tr ? tr.dietaId || null : null, consumo: encerrado ? null : cons,
      hoje: { ...hojeC, total: hojeC.pasto + hojeC.trato + hojeC.fixos + hojeC.gerais },
      proprio,
    });
  }

  // Herança de custos na apartação: o derivado leva a parte dele, por cabeça.
  function custosDe(id, pilha = 0) {
    const r = res.get(id);
    if (r.custos) return r.custos;
    const c = somar(ZERO(), r.proprio);
    const pai = r.lote.origemId && pilha < 50 ? porId.get(r.lote.origemId) : null;
    if (pai && pai.quantidade > 0) somar(c, custosDe(pai.id, pilha + 1), r.lote.quantidade / pai.quantidade);
    r.custos = c;
    return c;
  }
  for (const [id, r] of res) {
    r.custos = custosDe(id);
    r.total = totalDe(r.custos);
    const raiz = loteRaiz(db, r.lote);
    r.raiz = raiz;
    r.dias = r.fim - nDia(raiz.dataEntrada);
    r.pesoFinal = r.saida && r.saida.peso ? r.saida.peso : r.peso;
  }

  const ordem = (a, b) => a.lote.numero.localeCompare(b.lote.numero, "pt-BR", { numeric: true });
  const todos = [...res.values()].sort(ordem);
  const ativos = todos.filter((r) => r.lote.ativo);

  // Pastos hoje.
  const infoPastos = [...pastos.values()].map((p) => {
    const aqui = ativos.filter((r) => r.pastoId === p.id);
    const cab = aqui.reduce((s, r) => s + r.lote.quantidade, 0);
    const mp = cabPasto.get(p.id);
    let vazioHa = null;
    if (!cab && mp && mp.size) { const ult = Math.max(...mp.keys()); vazioHa = H - ult - 1; }
    let ocioso = 0;
    if (p.precosN.length) {
      for (let d = Math.max(p.precosN[0].d, H - 365); d < H; d++) if (!(mp && mp.get(d))) ocioso += custoPastoDia(p, d);
    }
    const pesoVivo = aqui.reduce((s, r) => s + r.peso * r.lote.quantidade, 0);
    return {
      pasto: p, lotes: aqui, cabecas: cab, lotacao: p.area > 0 ? cab / p.area : null, ua: p.area > 0 ? pesoVivo / 450 / p.area : null,
      custoDia: custoPastoDia(p, H), vazioHa, ocioso,
      desde: aqui.length ? aqui.map((r) => r.desdePasto).sort()[0] : null,
    };
  }).sort((a, b) => String(a.pasto.nome).localeCompare(String(b.pasto.nome), "pt-BR", { numeric: true }));

  const cabecas = ativos.reduce((s, r) => s + r.lote.quantidade, 0);
  const machos = ativos.filter((r) => r.lote.sexo === "M").reduce((s, r) => s + r.lote.quantidade, 0);
  const pesoTotal = ativos.reduce((s, r) => s + r.peso * r.lote.quantidade, 0);
  const comGmd = ativos.filter((r) => r.gmdReal != null);
  const cabGmd = comGmd.reduce((s, r) => s + r.lote.quantidade, 0);
  const custoDia = ativos.reduce((s, r) => s + r.hoje.total, 0);
  const areaOcupada = infoPastos.filter((p) => p.cabecas).reduce((s, p) => s + (p.pasto.area || 0), 0);
  const cabEmPasto = infoPastos.reduce((s, p) => s + p.cabecas, 0);

  /** Resumo de um mês: custos fixos e gerais e quanto ficou por cabeça por dia. */
  function resumoMes(chave) {
    const m = mensal(chave);
    const d0 = nDia(chave + "-01");
    let soma = 0, n = 0;
    for (let d = d0; d < d0 + m.dias && d <= H; d++) { const c = cabFaz.get(d); if (c) { soma += (m.fixoDia + m.geralDia) / c; n++; } }
    return { ...m, total: m.fixo + m.geral, cabDia: n ? soma / n : null };
  }

  return {
    hoje, lote: (id) => res.get(id) || null, lotes: todos, ativos, pastos: infoPastos, resumoMes,
    fazenda: {
      cabecas, machos, femeas: cabecas - machos, lotesAtivos: ativos.length, lotesEncerrados: db.lotes.length - ativos.length,
      pesoTotal, pesoMedio: cabecas ? pesoTotal / cabecas : null,
      gmdMedio: cabGmd ? comGmd.reduce((s, r) => s + r.gmdReal * r.lote.quantidade, 0) / cabGmd : null,
      custoDia, custoCabDia: cabecas ? custoDia / cabecas : null,
      pastosOcupados: infoPastos.filter((p) => p.cabecas).length, pastosVazios: infoPastos.filter((p) => !p.cabecas).length,
      lotacaoMedia: areaOcupada > 0 ? cabEmPasto / areaOcupada : null,
    },
  };
}

/** Fechamento de uma saída (ou simulação): arrobas, receita, custo por dia e resultado. */
export function fechamento(r, s) {
  const q = s.quantidade || r.lote.quantidade;
  const pesoTotal = (s.peso || 0) * q;
  const rend = s.rendReal != null && s.rendReal !== "" ? Number(s.rendReal) : s.rendEsp != null && s.rendEsp !== "" ? Number(s.rendEsp) : null;
  let arrobas = null, receita = null;
  if (s.tipo === "abate") {
    if (rend != null && pesoTotal) arrobas = (pesoTotal * rend) / 100 / 15;
    if (arrobas != null && s.precoArroba) receita = arrobas * s.precoArroba;
  } else if (s.tipo === "vivo") {
    if (pesoTotal && s.precoKg) receita = pesoTotal * s.precoKg;
  }
  const d = r.dias;
  const producao = r.total - r.custos.aquisicao;
  return {
    pesoTotal, rend, rendReal: s.rendReal != null && s.rendReal !== "", arrobas, receita,
    custoTotal: r.total, custoDia: d > 0 ? r.total / d : null, custoDiaProd: d > 0 ? producao / d : null,
    custoCabDia: d > 0 && q ? r.total / d / q : null, custoCabDiaProd: d > 0 && q ? producao / d / q : null,
    resultado: receita != null ? receita - r.total : null, resultadoCab: receita != null && q ? (receita - r.total) / q : null,
    gmdPeriodo: d > 0 && s.peso ? (s.peso - r.raiz.pesoEntrada) / d : null,
  };
}
