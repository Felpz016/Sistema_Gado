// Painel inicial e módulo Lotes (entrada de lote e lotes ativos).
import {
  store, S, M, $, esc, d2, n0, n1, n2, n3, rs, fmtGmd, gmdCls, num, icon, sexoPill, tagLote, toast, msgSalvo, erros,
  nomeFazenda, lotePorId, nomeLote, nomeDe, opcoes, campo, campoData, sel, seg, val, marcado, TELAS, hoje,
} from "./base.js";
import { pesagensDoLote, dias } from "./calc.js";

const RACAS = ["Nelore", "Angus", "Brahman", "Senepol", "Tabapuã", "Guzerá", "Girolando", "Cruzado (Angus × Nelore)", "Mestiço"];
const AVISO_PESAGEM = 30; // dias sem pesagem para avisar no painel

// ------------------------------------------------------------ painel
TELAS.painel = {
  lista() {
    const m = M(), f = m.fazenda, h = hoje();
    const semPesar = m.ativos.filter((r) => dias(r.ref.data, h) > AVISO_PESAGEM);
    const evs = [
      ...S.db.lotes.map((l) => ({ data: l.dataEntrada, loteId: l.id, k: "ent", t: l.origemId ? "Apartação" : "Entrada", x: `${l.quantidade} cab. · ${n0(l.pesoEntrada)} kg` })),
      ...S.db.pesagens.map((p) => ({ data: p.data, loteId: p.loteId, k: "peso", t: "Pesagem", x: `${n0(p.peso)} kg/animal` })),
      ...S.db.sanidade.map((s) => ({ data: s.data, loteId: s.loteId, k: "san", t: s.tipo === "tratamento" ? "Tratamento" : "Protocolo", x: s.medId ? nomeDe("meds", s.medId, "medicamento") : s.procedimento || "" })),
      ...S.db.movs.filter((x) => !x.inicial).map((x) => ({ data: x.data, loteId: x.loteId, k: "pasto", t: "Mudança de pasto", x: "para " + nomeDe("pastos", x.pastoId, "sem pasto") })),
      ...S.db.saidas.map((s) => ({ data: s.data, loteId: s.loteId, k: "ent", t: "Saída", x: s.destino || "" })),
    ].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 8);
    const xls = `<button class="btn ghost sm" type="button" data-act="excel">${icon("excel")} Baixar planilha Excel</button>`;
    return `
    <section class="card hero"><div><span class="label">Controle de gado</span><h2>${esc(nomeFazenda())}</h2></div>
      <div class="meta"><span>Hoje, ${d2(h)}</span>${xls}</div></section>
    <section class="kpis">
      <div class="card kpi dark"><span class="label">Cabeças ativas</span><span class="v">${n0(f.cabecas)}</span><span class="s">${f.machos} machos · ${f.femeas} fêmeas</span></div>
      <div class="card kpi dark"><span class="label">Custo do dia da fazenda</span><span class="v">${rs(f.custoDia, 0)}</span><span class="s">${f.custoCabDia == null ? "sem lotes ativos" : rs(f.custoCabDia) + " por cabeça por dia"}</span></div>
      <div class="card kpi"><span class="label">Lotes ativos</span><span class="v">${f.lotesAtivos}</span><span class="s">${f.lotesEncerrados} ${f.lotesEncerrados === 1 ? "lote encerrado" : "lotes encerrados"}</span></div>
      <div class="card kpi"><span class="label">Peso médio estimado</span><span class="v">${f.pesoMedio == null ? "—" : n0(f.pesoMedio)} <small>kg</small></span><span class="s">média por cabeça · ${n0(f.pesoTotal)} kg no total</span></div>
      <div class="card kpi"><span class="label">GMD médio real</span><span class="v">${fmtGmd(f.gmdMedio)} <small>kg/dia</small></span><span class="s">última pesagem de cada lote</span></div>
      <div class="card kpi"><span class="label">Pastos</span><span class="v">${f.pastosOcupados}<small> ocupados</small></span><span class="s">${f.pastosVazios} ${f.pastosVazios === 1 ? "vazio" : "vazios"}</span></div>
      <div class="card kpi"><span class="label">Lotação média</span><span class="v">${f.lotacaoMedia == null ? "—" : n2(f.lotacaoMedia)} <small>cab/ha</small></span><span class="s">nos pastos ocupados</span></div>
      <div class="card kpi"><span class="label">Sem pesagem há ${AVISO_PESAGEM}+ dias</span><span class="v">${semPesar.length}</span><span class="s">${semPesar.length ? semPesar.slice(0, 4).map((r) => esc(r.lote.numero)).join(", ") + (semPesar.length > 4 ? "…" : "") : "todos os lotes em dia"}</span></div>
    </section>
    ${semPesar.length ? `<div class="banner"><span><b>${semPesar.length === 1 ? "1 lote está" : semPesar.length + " lotes estão"} há mais de ${AVISO_PESAGEM} dias sem pesagem.</b> O peso e os custos de trato desses lotes estão só na estimativa.</span><button class="btn sm" type="button" data-act="ir" data-to="pesagem">Lançar pesagem</button></div>` : ""}
    ${m.ativos.length ? `
    <div class="grid2">
      <section class="card">
        <div class="sec-h"><h3>Lotes na fazenda</h3><button class="link" type="button" data-act="ir" data-to="lotes">Ver todos</button></div>
        <div class="tw"><table><thead><tr><th>Lote</th><th class="r">Cab.</th><th class="r">Peso est.</th><th class="r">Custo/dia</th><th>Pasto</th></tr></thead><tbody>
        ${m.ativos.map((r) => `<tr class="click" data-act="lote" data-id="${r.lote.id}"><td>${tagLote(r.lote)}</td><td class="r">${r.lote.quantidade}</td><td class="r">${n0(r.peso)} kg</td><td class="r">${rs(r.hoje.total)}</td><td>${esc(nomeDe("pastos", r.pastoId))}</td></tr>`).join("")}
        </tbody></table></div>
      </section>
      <section class="card">
        <div class="sec-h"><h3>Últimos lançamentos</h3></div>
        ${evs.length ? `<div class="timeline">${evs.map((e) => `<div class="ev"><span class="d">${d2(e.data)}</span><div><span class="tag ${e.k}">${e.t}</span> · <b>${esc(nomeLote(e.loteId))}</b><div class="x">${esc(e.x)}</div></div></div>`).join("")}</div>`
        : '<p class="empty">Nenhum lançamento ainda.</p>'}
      </section>
    </div>` : `
    <section class="card"><h3>Nenhum lote na fazenda</h3><p class="note" style="margin:8px 0 14px">Comece cadastrando os pastos e depois a entrada do primeiro lote.</p>
      <div class="actions"><button class="btn" type="button" data-act="ir" data-to="lotes/entrada">Cadastrar lote</button><button class="btn ghost" type="button" data-act="ir" data-to="pasto/cadastro">Cadastrar pastos</button></div></section>`}
    ${S.modo === "nuvem" ? `<p class="note mob-only">Conectado como ${esc(S.usuario.email)} · <button class="link" type="button" data-act="sair">Sair</button></p>` : ""}`;
  },
};

// ------------------------------------------------------------ formulário do lote (entrada, correção e apartação)
export function proximoNumero() {
  let melhor = null;
  for (const l of S.db.lotes) {
    if (l.origemId) continue;
    const m = /^(.*?)(\d+)$/.exec(l.numero || "");
    if (m && (!melhor || +m[2] > melhor.n)) melhor = { pre: m[1], n: +m[2], w: m[2].length };
  }
  return melhor ? melhor.pre + String(melhor.n + 1).padStart(melhor.w, "0") : "001";
}
export const listaRacas = () => [...new Set([...RACAS, ...S.db.lotes.map((l) => l.raca).filter(Boolean)])];
export const opcoesPasto = (v) => opcoes("pastos", v, S.db.pastos.length ? "Escolha o pasto" : "Nenhum pasto cadastrado");
export const opcoesDieta = (v) => opcoes("dietas", v, "Sem trato (só pasto)");

/** l: dados atuais do lote; x: { pastoId, piquete, dietaId } do início; derivado: sem os campos de compra. */
export function camposLote(l = {}, pfx = "e", x = {}, derivado = false) {
  return `
    <div class="fgrid">
      ${campo(pfx + "-num", "Número do lote", { v: l.numero ?? proximoNumero() })}
      ${campoData(pfx + "-data", "Data de entrada", l.dataEntrada)}
      ${campo(pfx + "-qtd", "Quantidade de cabeças", { tipo: "number", modo: "numeric", passo: 1, v: l.quantidade, ph: "0" })}
      ${seg(pfx + "-sexo", "Sexo", [["M", "Macho"], ["F", "Fêmea"]], l.sexo === "F" ? "F" : "M")}
      ${campo(pfx + "-peso", "Peso médio de entrada (kg/cabeça)", { tipo: "number", v: l.pesoEntrada, ph: "300" })}
      ${campo(pfx + "-pesot", "ou peso total do lote (kg)", { tipo: "number", v: l.pesoEntrada && l.quantidade ? Math.round(l.pesoEntrada * l.quantidade * 10) / 10 : "", ph: "o sistema calcula o outro" })}
      ${derivado ? "" : `
      <div class="fsec"><span class="kicker">Compra</span></div>
      ${campo(pfx + "-ckg", "Custo por kg (R$/kg)", { tipo: "number", v: l.custoKg, ph: "11,50" })}
      ${campo(pfx + "-orig", "Origem", { v: l.origem, ph: "Fornecedor, fazenda ou cidade" })}
      ${campo(pfx + "-com", "Comissão (R$, total do lote)", { tipo: "number", v: l.comissao, ph: "0" })}
      ${campo(pfx + "-fre", "Frete (R$, total do lote)", { tipo: "number", v: l.frete, ph: "0" })}`}
      <div class="fsec"><span class="kicker">Animais</span></div>
      <div class="f"><label for="${pfx}-raca">Raça</label><input id="${pfx}-raca" list="${pfx}-racas" autocomplete="off" value="${esc(l.raca ?? "")}" placeholder="Ex.: Nelore"><datalist id="${pfx}-racas">${listaRacas().map((r) => `<option value="${esc(r)}">`).join("")}</datalist></div>
      ${campo(pfx + "-idade", "Idade (meses)", { tipo: "number", modo: "numeric", passo: 1, v: l.idadeMeses, ph: "opcional" })}
      <div class="fsec"><span class="kicker">Para onde vai</span></div>
      ${sel(pfx + "-pasto", "Pasto de destino", opcoesPasto(x.pastoId), { hint: S.db.pastos.length ? "" : "Cadastre os pastos em Manejo de pasto para o custo do pasto entrar na conta." })}
      ${campo(pfx + "-piq", "Piquete", { v: x.piquete, ph: "opcional" })}
      ${sel(pfx + "-dieta", "Trato", opcoesDieta(x.dietaId), { hint: "Recria confinada ou suplemento: escolha a dieta." })}
      ${campo(pfx + "-gmd", "GMD estimado (kg/dia)", { tipo: "number", v: l.gmdEst, ph: "0,800", hint: "Base do peso estimado entre as pesagens." })}
      <div class="f full"><label for="${pfx}-obs">Observações</label><textarea id="${pfx}-obs" rows="2" placeholder="Estado dos animais, combinado com o vendedor…">${esc(l.obs ?? "")}</textarea></div>
    </div>`;
}

/** Liga os dois campos de peso (médio e total) e a caixa do custo de aquisição. */
export function ligarCamposLote(form, pfx, caixa) {
  const g = (id) => $("#" + pfx + "-" + id, form);
  const conta = () => {
    if (!caixa) return;
    const q = num(g("qtd").value), p = num(g("peso").value), ck = g("ckg") ? num(g("ckg").value) : null;
    if (!q || !p || ck == null) { caixa.innerHTML = ""; return; }
    const com = num(g("com").value) || 0, fr = num(g("fre").value) || 0;
    const tot = q * p * ck + com + fr;
    caixa.innerHTML = `
      <div><span class="label">Peso total</span><b>${n0(q * p)} kg</b></div>
      <div><span class="label">Por cabeça</span><b>${rs(tot / q)}</b></div>
      <div><span class="label">Por kg, com comissão e frete</span><b>${rs(tot / (q * p))}</b></div>
      <div class="res"><span class="label">Custo de aquisição</span><b>${rs(tot)}</b></div>
      <span class="formula">${n0(q * p)} kg × ${rs(ck)} + comissão ${rs(com)} + frete ${rs(fr)}</span>`;
  };
  const r1 = (v) => Math.round(v * 10) / 10;
  g("peso").addEventListener("input", () => { const q = num(g("qtd").value), p = num(g("peso").value); g("pesot").value = q && p ? r1(q * p) : ""; });
  g("pesot").addEventListener("input", () => { const q = num(g("qtd").value), t = num(g("pesot").value); if (q && t) g("peso").value = r1(t / q); });
  g("qtd").addEventListener("input", () => { const q = num(g("qtd").value), p = num(g("peso").value), t = num(g("pesot").value); if (q && p) g("pesot").value = r1(q * p); else if (q && t) g("peso").value = r1(t / q); });
  form.addEventListener("input", conta);
  conta();
}

export function lerLote(form, pfx, idAtual, derivado = false) {
  const v = (id) => ($("#" + pfx + "-" + id, form)?.value ?? "").trim();
  const dados = {
    numero: v("num").toUpperCase(),
    dataEntrada: v("data"),
    quantidade: num(v("qtd")),
    sexo: marcado(pfx + "-sexo"),
    idadeMeses: num(v("idade")),
    pesoEntrada: num(v("peso")),
    raca: v("raca"),
    gmdEst: num(v("gmd")),
    obs: v("obs"),
  };
  if (!derivado) Object.assign(dados, { custoKg: num(v("ckg")), comissao: num(v("com")) || 0, frete: num(v("fre")) || 0, origem: v("orig") });
  const extra = { pastoId: v("pasto") || null, piquete: v("piq"), dietaId: v("dieta") || null };
  const e = [];
  if (!dados.numero) e.push([pfx + "-num", "Informe o número do lote."]);
  else if (S.db.lotes.some((l) => l.ativo && l.numero.toUpperCase() === dados.numero && l.id !== idAtual)) e.push([pfx + "-num", `Já existe um lote ativo ${dados.numero}.`]);
  if (!dados.dataEntrada) e.push([pfx + "-data", "Informe a data de entrada."]);
  else if (dados.dataEntrada > hoje()) e.push([pfx + "-data", "A data de entrada não pode ser no futuro."]);
  if (!dados.quantidade || dados.quantidade < 1 || !Number.isInteger(dados.quantidade)) e.push([pfx + "-qtd", "Informe quantas cabeças (número inteiro)."]);
  if (!dados.pesoEntrada || dados.pesoEntrada <= 0) e.push([pfx + "-peso", "Informe o peso de entrada."]);
  if (!derivado && (dados.custoKg == null || dados.custoKg < 0)) e.push([pfx + "-ckg", "Informe o custo por kg."]);
  if (!dados.raca) e.push([pfx + "-raca", "Informe a raça."]);
  if (S.db.pastos.length && !extra.pastoId) e.push([pfx + "-pasto", "Escolha o pasto."]);
  if (dados.gmdEst == null || dados.gmdEst < 0) e.push([pfx + "-gmd", "Informe o GMD estimado."]);
  if (idAtual && dados.dataEntrada) {
    const p = pesagensDoLote(S.db, idAtual);
    if (p.length && p[0].data <= dados.dataEntrada) e.push([pfx + "-data", `Já existe pesagem em ${d2(p[0].data)}. A entrada precisa ser antes dela.`]);
  }
  return { dados, extra, ok: erros(form, e) };
}

/** Operações para gravar um lote novo já no pasto e na dieta escolhidos. */
export function opsNovoLote(id, dados, extra) {
  return [
    { tipo: "set", col: "lotes", id, dados: { ...dados, ativo: true } },
    { tipo: "set", col: "movs", id: store.novoId(), dados: { loteId: id, data: dados.dataEntrada, pastoId: extra.pastoId, piquete: extra.piquete || "", inicial: true } },
    { tipo: "set", col: "tratos", id: store.novoId(), dados: { loteId: id, data: dados.dataEntrada, dietaId: extra.dietaId, inicial: true } },
  ];
}

// ------------------------------------------------------------ entrada de lote
TELAS["lotes/entrada"] = {
  form: () => `<form class="card" id="fEnt" novalidate>${camposLote()}
    <div class="calc" id="e-calc" aria-live="polite"></div>
    <div class="actions"><button class="btn" type="submit">Cadastrar lote</button><span class="note">O lote entra em Lotes ativos, já no pasto escolhido.</span></div></form>`,
  ligar() {
    const f = $("#fEnt");
    ligarCamposLote(f, "e", $("#e-calc"));
    f.onsubmit = (ev) => {
      ev.preventDefault();
      const { dados, extra, ok } = lerLote(f, "e");
      if (!ok) return;
      store.gravar(opsNovoLote(store.novoId(), dados, extra));
      toast(`Lote ${dados.numero} cadastrado. ${msgSalvo()}`);
      location.hash = "lotes/ativos";
    };
  },
  lista: () => {
    const l = S.db.lotes.filter((x) => !x.origemId).sort((a, b) => b.dataEntrada.localeCompare(a.dataEntrada)).slice(0, 8);
    return `<section class="card"><div class="sec-h"><h3>Últimas entradas</h3></div>
    ${l.length ? `<div class="tw"><table><thead><tr><th>Lote</th><th>Data</th><th class="r">Cab.</th><th>Sexo</th><th>Raça</th><th>Origem</th><th class="r">Peso</th><th class="r">R$/kg</th><th class="r">Aquisição</th></tr></thead><tbody>
    ${l.map((x) => `<tr class="click" data-act="lote" data-id="${x.id}"><td>${tagLote(x)}</td><td>${d2(x.dataEntrada)}</td><td class="r">${x.quantidade}</td><td>${sexoPill(x.sexo)}</td><td>${esc(x.raca) || "—"}</td><td>${esc(x.origem) || "—"}</td><td class="r">${n0(x.pesoEntrada)} kg</td><td class="r">${x.custoKg == null ? "—" : n2(x.custoKg)}</td><td class="r">${x.custoKg == null ? "—" : rs(x.quantidade * x.pesoEntrada * x.custoKg + (x.comissao || 0) + (x.frete || 0), 0)}</td></tr>`).join("")}
    </tbody></table></div>` : '<p class="empty">Nenhum lote cadastrado ainda.</p>'}</section>`;
  },
};

// ------------------------------------------------------------ lotes ativos
const pesoTag = (r) => (r.ref.origem === "pesagem" && r.ref.data === hoje() ? '<span class="pill m">balança</span>' : '<span class="pill est">estimado</span>');
const consumoTxt = (r) => (r.consumo ? `${n2(r.consumo.pv)}% PV` : "pasto");

TELAS["lotes/ativos"] = {
  lista() {
    const rows = M().ativos;
    if (!rows.length) return `<section class="card"><h3>Nenhum lote ativo</h3><p class="note" style="margin:8px 0 14px">Cadastre um lote em Entrada de lote.</p><div class="actions"><button class="btn" type="button" data-act="ir" data-to="lotes/entrada">Cadastrar lote</button></div></section>`;
    return `
    <section class="card desk-only"><div class="tw"><table><thead><tr><th>Lote</th><th class="r">Cab.</th><th class="r">Dias na fazenda</th><th class="r">Peso atual</th><th class="r">GMD est.</th><th class="r">GMD real</th><th class="r">Custo/dia do lote</th><th class="r">Por cabeça</th><th class="r">Consumo</th><th>Pasto</th></tr></thead><tbody>
    ${rows.map((r) => `<tr class="click" data-act="lote" data-id="${r.lote.id}"><td>${tagLote(r.lote)}</td><td class="r">${r.lote.quantidade}</td><td class="r">${r.dias}</td>
      <td class="r"><b>${n0(r.peso)} kg</b><div class="note">${r.ref.origem === "entrada" ? "sem pesagem" : "pesou " + d2(r.ref.data)}</div></td>
      <td class="r">${n3(r.gmdEst)}</td><td class="r ${gmdCls(r.gmdReal)}">${fmtGmd(r.gmdReal)}</td>
      <td class="r"><b>${rs(r.hoje.total)}</b></td><td class="r">${rs(r.hoje.total / r.lote.quantidade)}</td>
      <td class="r">${consumoTxt(r)}${r.consumo ? `<div class="note">${n1(r.consumo.kgCab)} kg/cab</div>` : ""}</td>
      <td>${esc(nomeDe("pastos", r.pastoId))}${r.piquete ? `<div class="note">${esc(r.piquete)}</div>` : ""}</td></tr>`).join("")}
    </tbody></table></div><p class="note" style="margin-top:10px">Peso atual, custo por dia e consumo são estimados pelo sistema. Depois de uma pesagem, o peso da balança passa a valer.</p></section>
    <div class="lcards">${rows.map((r) => `<button type="button" class="card lcard" data-act="lote" data-id="${r.lote.id}">
      <div><div class="row">${tagLote(r.lote)}${sexoPill(r.lote.sexo)}</div><div class="sub" style="margin-top:6px">${r.lote.quantidade} cabeças · ${r.dias} dias · ${esc(nomeDe("pastos", r.pastoId, "sem pasto"))}</div></div>
      <div><div class="big">${n0(r.peso)}<small> kg</small></div><div class="sub" style="text-align:right">${pesoTag(r)}</div></div>
      <div class="full"><span>custo/dia ${rs(r.hoje.total)}</span><span>${rs(r.hoje.total / r.lote.quantidade)}/cab</span><span>GMD est. ${n3(r.gmdEst)}</span><span>real <span class="${gmdCls(r.gmdReal)}">${fmtGmd(r.gmdReal)}</span></span><span>${consumoTxt(r)}</span></div>
    </button>`).join("")}</div>
    <p class="note">Toque num lote para ver custos, histórico completo, corrigir dados ou excluir lançamentos.</p>`;
  },
};

export { lotePorId };
