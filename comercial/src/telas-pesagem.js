// Pesagem e apartação: pesagem (balança × estimado), ajuste do GMD estimado e lotes derivados.
import {
  store, S, M, $, $$, esc, d2, n0, n1, n3, num, sinal, fmtGmd, gmdCls, tagLote, toast, msgSalvo, erros, ativos, lotePorId, nomeDe,
  opcoesLotes, campo, campoData, sel, val, TELAS, hoje, ui,
} from "./base.js";
import { dias, pesagensDoLote, referenciaAnterior, calcGmd, pesoEstimadoEm, gmdEstimadoEm } from "./calc.js";
import { opcoesPasto, opcoesDieta, opsNovoLote, listaRacas } from "./telas-lotes.js";

let filtroPes = "";
const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);

function filtroSelect(id, valor) {
  const lotes = [...S.db.lotes].sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }));
  return `<select id="${id}" aria-label="Filtrar por lote" style="background:#fff;border:1.5px solid var(--line);border-radius:10px;padding:7px 10px;max-width:50%"><option value="">Todos os lotes</option>${lotes.map((l) => `<option value="${l.id}" ${l.id === valor ? "selected" : ""}>${esc(l.numero)}${l.ativo ? "" : " (encerrado)"}</option>`).join("")}</select>`;
}
function atualizarSelect(id) {
  const el = $("#" + id);
  if (!el) return;
  el.innerHTML = opcoesLotes(ativos(), el.value);
  el.dispatchEvent(new Event("change"));
}

// ------------------------------------------------------------ pesagem
function calcPesagem() {
  const box = $("#p-calc");
  if (!box) return;
  const l = lotePorId(val("p-lote")), data = val("p-data"), peso = num(val("p-peso"));
  if (!l) { box.innerHTML = '<span class="formula">Nenhum lote ativo. Cadastre um lote em Lotes.</span>'; return; }
  if (!data || data <= l.dataEntrada) { box.innerHTML = `<span class="formula">Informe uma data depois da entrada do lote (${d2(l.dataEntrada)}).</span>`; return; }
  const est = pesoEstimadoEm(S.db, l, data), a = est.ref, dd = dias(a.data, data);
  const gReal = peso && dd > 0 ? (peso - a.peso) / dd : null, gEst = dd > 0 ? (est.peso - a.peso) / dd : null;
  const dif = peso ? peso - est.peso : null;
  box.innerHTML = `
    <div><span class="label">Peso estimado na data</span><b>${n1(est.peso)} kg</b><span class="note">pelo GMD estimado</span></div>
    <div><span class="label">Balança × estimado</span><b class="${dif == null ? "" : dif >= 0 ? "pos" : "neg"}">${dif == null ? "—" : sinal(dif) + " kg"}</b><span class="note">${dif == null ? "" : sinal(pct(peso, est.peso)) + "%"}</span></div>
    <div><span class="label">GMD estimado</span><b>${fmtGmd(gEst)}</b><span class="note">${dd} dias desde ${a.tipo.toLowerCase()}</span></div>
    <div class="res"><span class="label">GMD real</span><b class="${gmdCls(gReal)}">${fmtGmd(gReal)}</b><span class="note">${gReal == null || !gEst ? "kg/cabeça/dia" : sinal(pct(gReal, gEst)) + "% sobre o estimado"}</span></div>
    <span class="formula">GMD real = (${peso ? n1(peso) : "peso da balança"} − ${n1(a.peso)}) ÷ ${dd} dias. Referência: ${a.tipo.toLowerCase()} em ${d2(a.data)}.</span>`;
}

TELAS["pesagem/pesagem"] = {
  form: () => `
    <form class="card" id="fPes" novalidate>
      <div class="fgrid">
        ${sel("p-lote", "Lote", opcoesLotes(ativos()))}
        ${campoData("p-data", "Data da pesagem")}
        ${campo("p-peso", "Peso médio na balança (kg/cabeça)", { tipo: "number", ph: "Digite o peso médio", full: true })}
      </div>
      <details class="mais"><summary>Pesou só o total? Calcular a média</summary>
        <div class="fgrid">${campo("p-tot", "Peso total (kg)", { tipo: "number" })}${campo("p-cab", "Cabeças pesadas", { tipo: "number", modo: "numeric", passo: 1 })}</div></details>
      <div class="calc" id="p-calc" aria-live="polite"></div>
      <div class="actions"><button class="btn" type="submit">Salvar pesagem</button><span class="note">O peso da balança passa a valer como peso do lote.</span></div>
    </form>`,
  atualizarForm() { atualizarSelect("p-lote"); calcPesagem(); },
  ligar() {
    $("#fPes").addEventListener("input", (e) => {
      if (e.target.id === "p-tot" || e.target.id === "p-cab") {
        const t = num(val("p-tot")), c = num(val("p-cab"));
        if (t && c) $("#p-peso").value = Math.round((t / c) * 10) / 10;
      }
      calcPesagem();
    });
    $("#p-lote").addEventListener("change", calcPesagem);
    calcPesagem();
    $("#fPes").onsubmit = (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const l = lotePorId(val("p-lote"));
      const p = { loteId: l?.id, data: val("p-data"), peso: num(val("p-peso")) };
      const e = [];
      if (!l) e.push(["p-lote", "Escolha o lote."]);
      if (!p.data) e.push(["p-data", "Informe a data."]);
      else if (p.data > hoje()) e.push(["p-data", "A data não pode ser no futuro."]);
      else if (l && p.data <= l.dataEntrada) e.push(["p-data", `O lote entrou em ${d2(l.dataEntrada)}. A pesagem precisa ser depois.`]);
      else if (l && pesagensDoLote(S.db, l.id).some((x) => x.data === p.data)) e.push(["p-data", "Já existe pesagem deste lote nessa data. Exclua a anterior no histórico do lote se quiser corrigir."]);
      if (!p.peso || p.peso <= 0) e.push(["p-peso", "Informe o peso médio por cabeça."]);
      if (!erros(f, e)) return;
      const g = calcGmd(S.db, l, p).gmd;
      store.gravar([{ tipo: "set", col: "pesagens", id: store.novoId(), dados: p }]);
      toast(`Pesagem salva. GMD real do ${l.numero}: ${fmtGmd(g)} kg/dia. ${msgSalvo()}`);
      ["p-peso", "p-tot", "p-cab"].forEach((id) => { $("#" + id).value = ""; });
      calcPesagem();
    };
  },
  lista() {
    const hist = [...S.db.pesagens].filter((p) => !filtroPes || p.loteId === filtroPes).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 80);
    return `<section class="card"><div class="sec-h"><h3>Histórico de pesagens</h3>${filtroSelect("filtroPes", filtroPes)}</div>
    ${hist.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Lote</th><th class="r">Balança</th><th class="r">Estimado</th><th class="r">Diferença</th><th class="r">Dias</th><th class="r">GMD real</th><th class="r">GMD est.</th></tr></thead><tbody>
    ${hist.map((p) => {
      const l = lotePorId(p.loteId);
      if (!l) return "";
      const c = calcGmd(S.db, l, p), est = pesoEstimadoEm(S.db, l, p.data, p.id).peso, dif = p.peso - est;
      return `<tr class="click" data-act="lote" data-id="${l.id}"><td>${d2(p.data)}</td><td>${tagLote(l)}</td><td class="r"><b>${n1(p.peso)} kg</b></td><td class="r">${n1(est)} kg</td><td class="r ${dif >= 0 ? "pos" : "neg"}">${sinal(dif)} kg</td><td class="r">${c.dias}</td><td class="r ${gmdCls(c.gmd)}">${fmtGmd(c.gmd)}</td><td class="r">${c.dias > 0 ? n3((est - c.ref.peso) / c.dias) : "—"}</td></tr>`;
    }).join("")}
    </tbody></table></div>` : '<p class="empty">Nenhuma pesagem registrada.</p>'}</section>`;
  },
  ligarLista() {
    const el = $("#filtroPes");
    if (el) el.onchange = () => { filtroPes = el.value; ui.refazerLista(); };
  },
};

// ------------------------------------------------------------ ajuste do GMD estimado
function infoGmd() {
  const r = M().lote(val("g-lote")), el = $("#g-info");
  if (!el) return;
  if (!r) { el.textContent = ""; return; }
  el.innerHTML = `GMD estimado em uso no ${esc(r.lote.numero)}: <b>${n3(r.gmdEst)} kg/dia</b>. GMD real da última pesagem: <b>${fmtGmd(r.gmdReal)}</b>${r.gmdReal != null ? ` <button class="link" type="button" id="g-usar">usar este valor</button>` : " (ainda sem pesagem)"}.`;
  const b = $("#g-usar");
  if (b) b.onclick = () => { $("#g-novo").value = Math.round(r.gmdReal * 1000) / 1000; };
}

TELAS["pesagem/gmd"] = {
  form: () => `
    <form class="card" id="fGmd" novalidate>
      <div class="fgrid">
        ${sel("g-lote", "Lote", opcoesLotes(ativos()))}
        ${campoData("g-data", "Vale a partir de")}
        ${campo("g-novo", "Novo GMD estimado (kg/dia)", { tipo: "number", ph: "0,650" })}
        ${campo("g-mot", "Motivo", { ph: "opcional. Ex.: seca, troca de dieta" })}
      </div>
      <p class="note" id="g-info"></p>
      <div class="actions"><button class="btn" type="submit">Salvar ajuste</button><span class="note">As estimativas de antes da data não mudam.</span></div>
    </form>`,
  atualizarForm() { atualizarSelect("g-lote"); },
  ligar() {
    $("#g-lote").addEventListener("change", infoGmd);
    infoGmd();
    $("#fGmd").onsubmit = (ev) => {
      ev.preventDefault();
      const f = ev.target, l = lotePorId(val("g-lote")), data = val("g-data"), g = num(val("g-novo"));
      const e = [];
      if (!l) e.push(["g-lote", "Escolha o lote."]);
      if (!data) e.push(["g-data", "Informe a data."]);
      else if (l && data < l.dataEntrada) e.push(["g-data", `O lote entrou em ${d2(l.dataEntrada)}.`]);
      if (g == null || g < 0) e.push(["g-novo", "Informe o novo GMD estimado."]);
      if (!erros(f, e)) return;
      const mesmo = S.db.gmds.find((x) => x.loteId === l.id && x.data === data);
      const dados = { loteId: l.id, data, gmd: g, motivo: val("g-mot") };
      store.gravar([mesmo ? { tipo: "update", col: "gmds", id: mesmo.id, dados } : { tipo: "set", col: "gmds", id: store.novoId(), dados }]);
      toast(`GMD estimado do ${l.numero}: ${n3(g)} kg/dia a partir de ${d2(data)}. ${msgSalvo()}`);
      $("#g-novo").value = ""; $("#g-mot").value = "";
    };
  },
  lista() {
    const aj = [...S.db.gmds].sort((a, b) => b.data.localeCompare(a.data));
    return `<section class="card"><div class="sec-h"><h3>Histórico de ajustes</h3></div>
    ${aj.length ? `<div class="tw"><table><thead><tr><th>A partir de</th><th>Lote</th><th class="r">GMD da entrada</th><th class="r">Novo GMD</th><th>Motivo</th></tr></thead><tbody>
    ${aj.map((x) => { const l = lotePorId(x.loteId); return l ? `<tr class="click" data-act="lote" data-id="${l.id}"><td>${d2(x.data)}</td><td>${tagLote(l)}</td><td class="r">${n3(l.gmdEst || 0)}</td><td class="r"><b>${n3(x.gmd)}</b></td><td class="wrap">${esc(x.motivo) || "—"}</td></tr>` : ""; }).join("")}
    </tbody></table></div>` : '<p class="empty">Nenhum ajuste. Cada lote usa o GMD estimado informado na entrada.</p>'}</section>`;
  },
};

// ------------------------------------------------------------ apartação
let nDeriv = 2;

function blocoDerivado(i, o, d) {
  const p = `ap${i}`;
  return `<div class="sub-card" data-deriv="${i}"><h4><span>Lote derivado ${i}</span></h4>
    <div class="fgrid c4">
      ${campo(p + "-num", "Número", { v: d.numero ?? (o ? `${o.lote.numero}/${i}` : "") })}
      ${campo(p + "-qtd", "Cabeças", { tipo: "number", modo: "numeric", passo: 1, v: d.qtd })}
      ${campo(p + "-peso", "Peso médio (kg)", { tipo: "number", v: d.peso ?? (o ? Math.round(o.pesoData * 10) / 10 : "") })}
      ${campo(p + "-gmd", "GMD estimado", { tipo: "number", v: d.gmd ?? (o ? o.gmdEst : "") })}
      ${sel(p + "-sexo", "Sexo", `<option value="M" ${(d.sexo ?? o?.lote.sexo) !== "F" ? "selected" : ""}>Macho</option><option value="F" ${(d.sexo ?? o?.lote.sexo) === "F" ? "selected" : ""}>Fêmea</option>`)}
      <div class="f"><label for="${p}-raca">Raça</label><input id="${p}-raca" list="ap-racas" autocomplete="off" value="${esc(d.raca ?? o?.lote.raca ?? "")}"></div>
      ${sel(p + "-pasto", "Pasto", opcoesPasto(d.pasto ?? o?.pastoId))}
      ${campo(p + "-piq", "Piquete", { v: d.piq ?? "", ph: "opcional" })}
      ${sel(p + "-dieta", "Trato", opcoesDieta(d.dieta ?? o?.dietaId), { full: true })}
    </div></div>`;
}

function origemApart() {
  const l = lotePorId(val("ap-lote")), data = val("ap-data");
  if (!l) return null;
  const r = M().lote(l.id);
  const ok = data && data > l.dataEntrada;
  return { lote: l, pastoId: r.pastoId, dietaId: r.dietaId, gmdEst: ok ? gmdEstimadoEm(S.db, l, data) : r.gmdEst, pesoData: ok ? pesoEstimadoEm(S.db, l, data).peso + 0 : r.peso };
}
const lerDeriv = (i) => { const g = (c) => val(`ap${i}-${c}`); return { numero: g("num"), qtd: g("qtd"), peso: g("peso"), gmd: g("gmd"), sexo: g("sexo"), raca: g("raca"), pasto: g("pasto"), piq: g("piq"), dieta: g("dieta") }; };

function montarDerivados(manter) {
  const o = origemApart();
  const atuais = manter ? Array.from({ length: nDeriv }, (_, k) => ($(`#ap${k + 1}-num`) ? lerDeriv(k + 1) : {})) : [];
  $("#ap-derivs").innerHTML = Array.from({ length: nDeriv }, (_, k) => blocoDerivado(k + 1, o, atuais[k] || {})).join("");
  somaApart();
}
function somaApart() {
  const o = origemApart(), el = $("#ap-soma");
  if (!el) return;
  if (!o) { el.textContent = ""; return; }
  const soma = Array.from({ length: nDeriv }, (_, k) => num(val(`ap${k + 1}-qtd`)) || 0).reduce((a, b) => a + b, 0);
  el.innerHTML = `Soma das cabeças: <b class="${soma === o.lote.quantidade ? "pos" : "neg"}">${soma} de ${o.lote.quantidade}</b>. ${soma === o.lote.quantidade ? "Confere." : soma < o.lote.quantidade ? `Faltam ${o.lote.quantidade - soma}.` : `Passou em ${soma - o.lote.quantidade}.`}`;
}

TELAS["pesagem/apartacao"] = {
  form: () => `
    <form class="card" id="fAp" novalidate>
      <div class="fgrid c3">
        ${sel("ap-lote", "Lote a apartar", opcoesLotes(ativos()))}
        ${campoData("ap-data", "Data da apartação")}
        ${sel("ap-crit", "Critério", ["Peso", "Raça", "Pasto", "Sexo", "Outro"].map((c) => `<option>${c}</option>`).join(""))}
        ${campo("ap-crit2", "Detalhe do critério", { ph: "opcional. Ex.: acima e abaixo de 350 kg", full: true })}
      </div>
      <datalist id="ap-racas">${listaRacas().map((r) => `<option value="${esc(r)}">`).join("")}</datalist>
      <div id="ap-derivs" class="rows"></div>
      <p class="note" id="ap-soma" aria-live="polite"></p>
      <div class="actions"><button class="btn" type="submit">Apartar lote</button><button class="btn ghost sm" type="button" id="ap-mais">Mais um lote derivado</button><button class="mini" type="button" id="ap-menos">Tirar o último</button></div>
      <p class="note">O lote de origem sai dos ativos e fica no histórico. Cada derivado leva a parte dele dos custos já acumulados, por cabeça, e continua contando os dias desde a entrada original.</p>
    </form>`,
  atualizarForm() { const el = $("#ap-lote"), v = el.value; el.innerHTML = opcoesLotes(ativos(), v); if (el.value !== v) montarDerivados(false); },
  ligar() {
    nDeriv = 2;
    montarDerivados(false);
    $("#ap-lote").onchange = () => montarDerivados(false);
    $("#ap-data").onchange = () => montarDerivados(false);
    $("#ap-mais").onclick = () => { if (nDeriv < 8) { nDeriv++; montarDerivados(true); } };
    $("#ap-menos").onclick = () => { if (nDeriv > 2) { nDeriv--; montarDerivados(true); } };
    $("#ap-derivs").addEventListener("input", somaApart);
    $("#fAp").onsubmit = (ev) => {
      ev.preventDefault();
      const f = ev.target, l = lotePorId(val("ap-lote")), data = val("ap-data");
      const e = [];
      if (!l) e.push(["ap-lote", "Escolha o lote."]);
      if (!data) e.push(["ap-data", "Informe a data."]);
      else if (data > hoje()) e.push(["ap-data", "A data não pode ser no futuro."]);
      else if (l && data <= l.dataEntrada) e.push(["ap-data", `O lote entrou em ${d2(l.dataEntrada)}. A apartação precisa ser depois.`]);
      else if (l) {
        const ult = ["pesagens", "sanidade", "movs", "tratos", "gmds"].flatMap((c) => S.db[c].filter((x) => x.loteId === l.id).map((x) => x.data)).sort().pop();
        if (ult && ult > data) e.push(["ap-data", `O lote tem lançamento em ${d2(ult)}. A apartação precisa ser nessa data ou depois.`]);
      }
      const ds = Array.from({ length: nDeriv }, (_, k) => ({ i: k + 1, ...lerDeriv(k + 1) }));
      let soma = 0;
      const nums = new Set();
      for (const d of ds) {
        const p = `ap${d.i}`, q = num(d.qtd), peso = num(d.peso), g = num(d.gmd), numero = d.numero.toUpperCase();
        if (!numero) e.push([p + "-num", "Informe o número."]);
        else if (nums.has(numero) || S.db.lotes.some((x) => x.ativo && x.numero.toUpperCase() === numero)) e.push([p + "-num", "Número repetido."]);
        nums.add(numero);
        if (!q || q < 1 || !Number.isInteger(q)) e.push([p + "-qtd", "Informe as cabeças."]);
        if (!peso || peso <= 0) e.push([p + "-peso", "Informe o peso."]);
        if (g == null || g < 0) e.push([p + "-gmd", "Informe o GMD."]);
        if (S.db.pastos.length && !d.pasto) e.push([p + "-pasto", "Escolha o pasto."]);
        soma += q || 0;
      }
      if (l && !e.length && soma !== l.quantidade) e.push(["ap1-qtd", `A soma dos derivados (${soma}) precisa ser igual às ${l.quantidade} cabeças do lote ${l.numero}.`]);
      if (!erros(f, e)) return;
      const criterio = val("ap-crit") + (val("ap-crit2") ? ": " + val("ap-crit2") : "");
      const idade = l.idadeMeses != null ? l.idadeMeses + Math.round(dias(l.dataEntrada, data) / 30) : null;
      const ops = [{ tipo: "update", col: "lotes", id: l.id, dados: { ativo: false, apartadoEm: data, criterio } }];
      for (const d of ds) {
        ops.push(...opsNovoLote(store.novoId(), {
          numero: d.numero.toUpperCase(), dataEntrada: data, quantidade: num(d.qtd), sexo: d.sexo, idadeMeses: idade, pesoEntrada: num(d.peso),
          raca: d.raca, gmdEst: num(d.gmd), obs: "", origemId: l.id, criterio, custoKg: null,
        }, { pastoId: d.pasto || null, piquete: d.piq, dietaId: d.dieta || null }));
      }
      store.gravar(ops);
      toast(`${l.numero} apartado em ${ds.length} lotes: ${ds.map((d) => d.numero.toUpperCase()).join(", ")}. ${msgSalvo()}`);
      location.hash = "lotes/ativos";
    };
  },
  lista() {
    const ap = S.db.lotes.filter((l) => l.apartadoEm).sort((a, b) => b.apartadoEm.localeCompare(a.apartadoEm));
    return `<section class="card"><div class="sec-h"><h3>Apartações feitas</h3></div>
    ${ap.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Lote de origem</th><th>Critério</th><th>Lotes derivados</th></tr></thead><tbody>
    ${ap.map((l) => `<tr class="click" data-act="lote" data-id="${l.id}"><td>${d2(l.apartadoEm)}</td><td>${tagLote(l)} <span class="note">${l.quantidade} cab.</span></td><td class="wrap">${esc(l.criterio) || "—"}</td><td class="wrap">${S.db.lotes.filter((x) => x.origemId === l.id).map((x) => `${esc(x.numero)} (${x.quantidade})`).join(" · ")}</td></tr>`).join("")}
    </tbody></table></div>` : '<p class="empty">Nenhuma apartação ainda.</p>'}</section>`;
  },
};

export { referenciaAnterior, nomeDe, n0, $$ };
