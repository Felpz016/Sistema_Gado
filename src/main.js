import { criarStore, ultimoEmail } from "./store.js";
import {
  hojeISO, dias, pesoAtual, referenciaAnterior, calcGmd, ultimoGmd, saidaDoLote, resumo, pesagensDoLote,
} from "./calc.js";

const store = criarStore(() => agendar());
const S = store.S;

// ------------------------------------------------------------ utilidades
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const d2 = (iso) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const n0 = (v) => Math.round(v).toLocaleString("pt-BR");
const n1 = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n3 = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtGmd = (g) => (g == null ? "—" : n3(g));
const gmdCls = (g) => (g == null ? "" : g >= 0.5 ? "gmd-up" : "gmd-low");
const num = (v) => { const x = parseFloat(String(v).replace(",", ".")); return Number.isFinite(x) ? x : null; };
const icon = (id) => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const sexoPill = (s) => (s === "M" ? '<span class="pill m">Macho</span>' : '<span class="pill f">Fêmea</span>');
const ativos = () => S.db.lotes.filter((l) => l.ativo).sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }));
const lotePorId = (id) => S.db.lotes.find((l) => l.id === id);
const nomeLote = (id) => lotePorId(id)?.numero ?? "(lote excluído)";
const opcoesLotes = (lista, sel) =>
  lista.length
    ? lista.map((l) => `<option value="${l.id}" ${l.id === sel ? "selected" : ""}>${esc(l.numero)} · ${l.quantidade} cab.</option>`).join("")
    : '<option value="">Nenhum lote ativo</option>';
const RACAS = ["Nelore", "Angus", "Brahman", "Senepol", "Tabapuã", "Guzerá", "Girolando", "Cruzado (Angus × Nelore)", "Mestiço"];

function toast(msg) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 3500);
}
const msgSalvo = () => (S.modo === "demo" ? "Salvo neste aparelho." : S.online ? "Salvo na nuvem." : "Salvo no aparelho. Sobe para a nuvem quando a internet voltar.");

// Erros de formulário mostrados no próprio campo.
function erros(form, lista) {
  form.querySelectorAll(".f.err").forEach((f) => f.classList.remove("err"));
  form.querySelectorAll(".errmsg").forEach((e) => e.remove());
  for (const [id, msg] of lista) {
    const campo = form.querySelector("#" + id)?.closest(".f");
    if (campo) {
      campo.classList.add("err");
      campo.insertAdjacentHTML("beforeend", `<span class="errmsg">${esc(msg)}</span>`);
    }
  }
  if (lista.length) form.querySelector(".f.err input, .f.err select")?.focus();
  return lista.length === 0;
}

// ------------------------------------------------------------ navegação
const NAV = [
  ["painel", "Painel", "Painel"], ["entrada", "Entrada", "Entrada de lote"], ["lotes", "Lotes", "Lotes ativos"],
  ["saida", "Saída", "Saída de lote"], ["sanidade", "Sanidade", "Sanidade"], ["pesagem", "Pesagem", "Pesagem"],
];
const rota = () => { const h = location.hash.slice(1); return NAV.some((n) => n[0] === h) ? h : "painel"; };

let telaAtual = null; // qual tela está montada
let assinatura = "";  // muda quando os dados mudam
let drawer = null;    // { loteId, editando }
let filtroSan = "", filtroPes = "";

let agendado = false;
function agendar() {
  if (agendado) return;
  agendado = true;
  requestAnimationFrame(() => { agendado = false; render(); });
}
addEventListener("hashchange", () => { telaAtual = null; render(); scrollTo(0, 0); });

// ------------------------------------------------------------ casca
function render() {
  const root = $("#root");
  if (S.modo === "nuvem" && S.usuario === undefined) {
    root.innerHTML = '<div class="loading">Carregando…</div>';
    telaAtual = null;
    return;
  }
  if (S.modo === "nuvem" && S.usuario === null) { telaLogin(root); return; }

  if (!$(".app", root)) {
    root.innerHTML = `
    <div class="app">
      <aside class="side">
        <div class="brand"><small>Controle de gado</small><b>Fazenda<br>São João</b></div>
        <nav class="nav" id="nav" aria-label="Menu"></nav>
        <div class="acts">
          <button type="button" data-act="excel">${icon("excel")} Baixar planilha Excel</button>
          ${S.modo === "nuvem" ? `<button type="button" data-act="sair">${icon("sair")} Sair</button>` : ""}
        </div>
        <div class="user" id="userSide"></div>
      </aside>
      <div class="main">
        <header class="top">
          <span class="farm">Fazenda São João</span>
          <h1 id="title"></h1>
          <div class="sync" id="sync" role="status"><span class="dot"></span><span id="syncTxt"></span></div>
        </header>
        <main class="content">
          <div id="avisos"></div>
          <div id="form"></div>
          <div id="lista" style="display:flex;flex-direction:column;gap:18px"></div>
        </main>
      </div>
      <nav class="tabbar" id="tabbar" aria-label="Abas"></nav>
    </div>`;
    telaAtual = null;
  }

  const r = rota();
  const navHtml = (curta) => NAV.map(([k, s, l]) =>
    `<a href="#${k}" ${k === r ? 'aria-current="page"' : ""}>${icon(k)}<span>${curta ? s : l}</span></a>`).join("");
  $("#nav").innerHTML = navHtml(false);
  $("#tabbar").innerHTML = navHtml(true);
  $("#title").textContent = NAV.find((n) => n[0] === r)[2];
  $("#userSide").textContent = S.modo === "nuvem" ? S.usuario.email : "";
  renderStatus();
  renderAvisos();

  const novaAss = JSON.stringify(S.db);
  const dadosMudaram = novaAss !== assinatura;
  assinatura = novaAss;

  if (S.erro === "sem-acesso") {
    $("#form").innerHTML = "";
    $("#lista").innerHTML = "";
    telaAtual = null;
    return;
  }
  if (!S.carregado) {
    $("#form").innerHTML = "";
    $("#lista").innerHTML = '<div class="loading">Buscando os dados…</div>';
    return;
  }

  const T = TELAS[r];
  if (telaAtual !== r) {
    telaAtual = r;
    $("#form").innerHTML = T.form ? T.form() : "";
    T.ligar && T.ligar();
    $("#lista").innerHTML = T.lista();
    T.ligarLista && T.ligarLista();
  } else if (dadosMudaram) {
    T.atualizarForm && T.atualizarForm();
    $("#lista").innerHTML = T.lista();
    T.ligarLista && T.ligarLista();
  }
  if (drawer && (dadosMudaram || !$(".drawer")) && !drawer.editando) renderDrawer();
}

function renderStatus() {
  const el = $("#sync"), t = $("#syncTxt");
  if (!el) return;
  el.className = "sync";
  if (S.modo === "demo") { el.classList.add("off"); t.textContent = "Modo demonstração"; return; }
  if (S.erro) { el.classList.add("err"); t.textContent = S.erro === "sem-acesso" ? "Sem permissão" : "Erro ao salvar"; return; }
  const p = S.pendentes;
  if (!S.online) {
    el.classList.add("off");
    t.textContent = p ? `Sem internet · ${p} pendente${p > 1 ? "s" : ""}` : "Sem internet · salvando no aparelho";
  } else if (p) {
    el.classList.add("busy");
    t.textContent = `Enviando ${p} lançamento${p > 1 ? "s" : ""}…`;
  } else {
    t.textContent = "Online · tudo salvo na nuvem";
  }
}

function renderAvisos() {
  const a = $("#avisos");
  let h = "";
  if (S.modo === "demo") {
    h = `<div class="banner"><span><b>Modo demonstração.</b> Os dados ficam só neste aparelho e começam com exemplos. Falta ligar o sistema ao banco na nuvem.</span><button class="mini" type="button" data-act="restaurar">Restaurar exemplos</button></div>`;
  } else if (S.erro === "sem-acesso") {
    h = `<div class="banner bad"><span>A conta <b>${esc(S.usuario?.email)}</b> não tem permissão para ver os dados da fazenda. Entre com a conta autorizada.</span><button class="mini" type="button" data-act="sair">Trocar de conta</button></div>`;
  } else if (S.erro) {
    h = `<div class="banner bad"><span>${esc(S.erro)}</span></div>`;
  }
  if (a.dataset.h !== h) { a.innerHTML = h; a.dataset.h = h; a.hidden = !h; }
}

function telaLogin(root) {
  telaAtual = null;
  root.innerHTML = `
  <div class="login"><div class="box">
    <small class="label" style="color:inherit;opacity:.8">Controle de gado</small>
    <h1>Fazenda São João</h1>
    <p>Entre com a sua conta Google para ver e lançar os dados da fazenda.</p>
    <button class="btn" type="button" id="btnEntrar">${ultimoEmail() ? "Entrar como " + esc(ultimoEmail()) : "Entrar com Google"}</button>
    ${ultimoEmail() ? '<p style="font-size:13px;opacity:.8">Depois de entrar, o sistema fica conectado neste aparelho até você tocar em Sair.</p>' : ""}
    ${navigator.onLine ? "" : '<div class="err">Você está sem internet. O primeiro acesso em cada aparelho precisa de conexão. Depois disso o sistema funciona sem internet.</div>'}
    <div id="loginErr"></div>
  </div></div>`;
  $("#btnEntrar").onclick = async () => {
    try { await store.entrar(); }
    catch (e) { $("#loginErr").innerHTML = `<div class="err">Não foi possível entrar: ${esc(e.message)}</div>`; }
  };
}

// ------------------------------------------------------------ ações gerais
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "excel") {
    b.disabled = true;
    try {
      const { baixarPlanilha } = await import("./excel.js");
      await baixarPlanilha(S.db);
      toast("Planilha gerada com todos os dados do sistema.");
    } catch (err) {
      toast("Não foi possível gerar a planilha: " + err.message);
    } finally { b.disabled = false; }
  } else if (act === "sair") {
    await store.sair();
  } else if (act === "restaurar") {
    store.restaurarExemplo && store.restaurarExemplo();
    toast("Exemplos restaurados.");
  } else if (act === "lote") {
    abrirLote(b.dataset.id);
  } else if (act === "ir") {
    location.hash = b.dataset.to;
  }
});

// ------------------------------------------------------------ telas
const TELAS = {};

TELAS.painel = {
  lista() {
    const r = resumo(S.db);
    const at = ativos();
    const evs = [
      ...S.db.pesagens.map((p) => ({ ...p, k: "peso" })),
      ...S.db.sanidade.map((p) => ({ ...p, k: "san" })),
    ].filter((e) => lotePorId(e.loteId)?.ativo).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 6);
    return `
    <section class="card hero"><div><div class="label">Controle de gado</div><h2>Fazenda São João</h2></div>
      <div class="meta">Hoje, ${d2(hojeISO())}<br><button class="btn ghost excel-btn" type="button" data-act="excel" style="margin-top:8px">${icon("excel").replace("<svg", '<svg width="18" height="18"')} Baixar planilha Excel</button></div></section>
    <section class="kpis">
      <div class="card kpi"><span class="label">Cabeças ativas</span><span class="v num">${n0(r.cabecas)}</span><span class="s">${r.machos} machos · ${r.femeas} fêmeas</span></div>
      <div class="card kpi"><span class="label">Lotes ativos</span><span class="v num">${r.lotesAtivos}</span><span class="s">${r.lotesSaidos} ${r.lotesSaidos === 1 ? "lote" : "lotes"} no histórico de saídas</span></div>
      <div class="card kpi"><span class="label">GMD médio</span><span class="v num">${fmtGmd(r.gmdMedio)} <small>kg/dia</small></span><span class="s">última pesagem de cada lote</span></div>
      <div class="card kpi"><span class="label">Peso médio do rebanho</span><span class="v num">${r.pesoMedio == null ? "—" : n1(r.pesoMedio)} <small>kg</small></span><span class="s">média por cabeça · ${n0(r.pesoTotal)} kg no total</span></div>
    </section>
    <button class="btn ghost excel-btn mob-only" type="button" data-act="excel" style="justify-content:center">${icon("excel").replace("<svg", '<svg width="18" height="18"')} Baixar planilha Excel</button>
    ${at.length ? `
    <div class="grid2">
      <section class="card">
        <div class="sec-h"><h3>Lotes na fazenda</h3><button class="link" type="button" data-act="ir" data-to="lotes">Ver todos</button></div>
        <div class="tw"><table><thead><tr><th>Lote</th><th class="r">Cab.</th><th class="r">Peso atual</th><th class="r">GMD</th></tr></thead><tbody>
        ${at.map((l) => { const g = ultimoGmd(S.db, l); return `<tr class="click" data-act="lote" data-id="${l.id}"><td><span class="lote">${esc(l.numero)}</span></td><td class="r">${l.quantidade}</td><td class="r">${n0(pesoAtual(S.db, l).peso)} kg</td><td class="r ${gmdCls(g)}">${fmtGmd(g)}</td></tr>`; }).join("")}
        </tbody></table></div>
      </section>
      <section class="card">
        <div class="sec-h"><h3>Últimos lançamentos</h3></div>
        ${evs.length ? `<div class="timeline">${evs.map((e) => `<div class="ev"><span class="d">${d2(e.data)}</span><div><span class="tag ${e.k}">${e.k === "peso" ? "Pesagem" : "Sanidade"}</span> · <b>${esc(nomeLote(e.loteId))}</b><div class="x">${e.k === "peso" ? `${n0(e.peso)} kg/animal` : `${esc(e.procedimento)} · ${n1(e.doseMl)} ml`}</div></div></div>`).join("")}</div>`
        : '<p class="empty">Nenhuma pesagem ou manejo sanitário ainda.</p>'}
      </section>
    </div>` : `
    <section class="card"><h3>Nenhum lote na fazenda</h3><p class="note">Comece cadastrando o primeiro lote. Ele aparece aqui e em Lotes ativos.</p>
      <div class="actions"><button class="btn" type="button" data-act="ir" data-to="entrada">Cadastrar lote</button></div></section>`}
    ${S.modo === "nuvem" ? `<p class="note mob-only">Conectado como ${esc(S.usuario.email)} · <button class="link" type="button" data-act="sair">Sair</button></p>` : ""}`;
  },
};

function proximoNumero() {
  let melhor = null;
  for (const l of S.db.lotes) {
    const m = /^(.*?)(\d+)$/.exec(l.numero || "");
    if (m && (!melhor || +m[2] > melhor.n)) melhor = { pre: m[1], n: +m[2], w: m[2].length };
  }
  return melhor ? melhor.pre + String(melhor.n + 1).padStart(melhor.w, "0") : "L-001";
}
const listaRacas = () => [...new Set([...RACAS, ...S.db.lotes.map((l) => l.raca).filter(Boolean)])];

function camposLote(l = {}, pfx = "e") {
  return `
    <div class="fgrid">
      <div class="f"><label for="${pfx}-num">Número do lote</label><input id="${pfx}-num" autocomplete="off" value="${esc(l.numero ?? proximoNumero())}"></div>
      <div class="f"><label for="${pfx}-data">Data de entrada</label><input id="${pfx}-data" type="date" value="${l.dataEntrada ?? hojeISO()}"></div>
      <div class="f"><label for="${pfx}-qtd">Quantidade de cabeças</label><input id="${pfx}-qtd" type="number" inputmode="numeric" min="1" step="1" value="${l.quantidade ?? ""}" placeholder="0"></div>
      <div class="f"><label>Sexo</label><div class="seg"><input type="radio" name="${pfx}-sexo" id="${pfx}-m" value="M" ${l.sexo !== "F" ? "checked" : ""}><label for="${pfx}-m">Macho</label><input type="radio" name="${pfx}-sexo" id="${pfx}-f" value="F" ${l.sexo === "F" ? "checked" : ""}><label for="${pfx}-f">Fêmea</label></div></div>
      <div class="f"><label for="${pfx}-idade">Idade (meses)</label><input id="${pfx}-idade" type="number" inputmode="numeric" min="0" step="1" value="${l.idadeMeses ?? ""}" placeholder="12"></div>
      <div class="f"><label for="${pfx}-peso">Peso médio de entrada (kg/animal)</label><input id="${pfx}-peso" type="number" inputmode="decimal" min="1" step="0.1" value="${l.pesoEntrada ?? ""}" placeholder="280"></div>
      <div class="f full"><label for="${pfx}-raca">Raça</label><input id="${pfx}-raca" list="${pfx}-racas" autocomplete="off" value="${esc(l.raca ?? "")}" placeholder="Ex.: Nelore"><datalist id="${pfx}-racas">${listaRacas().map((r) => `<option value="${esc(r)}">`).join("")}</datalist><span class="hint">Escolha da lista ou digite outra.</span></div>
      <div class="f full"><label for="${pfx}-obs">Observações</label><textarea id="${pfx}-obs" rows="3" placeholder="Procedência, estado dos animais, pasto de destino…">${esc(l.obs ?? "")}</textarea></div>
    </div>`;
}

function lerLote(form, pfx, idAtual) {
  const v = (id) => $("#" + pfx + "-" + id, form).value.trim();
  const dados = {
    numero: v("num").toUpperCase(),
    dataEntrada: v("data"),
    quantidade: num(v("qtd")),
    sexo: $(`input[name=${pfx}-sexo]:checked`, form).value,
    idadeMeses: num(v("idade")),
    pesoEntrada: num(v("peso")),
    raca: v("raca"),
    obs: v("obs"),
  };
  const e = [];
  if (!dados.numero) e.push([pfx + "-num", "Informe o número do lote."]);
  else if (S.db.lotes.some((l) => l.numero.toUpperCase() === dados.numero && l.id !== idAtual)) e.push([pfx + "-num", `Já existe um lote ${dados.numero}.`]);
  if (!dados.dataEntrada) e.push([pfx + "-data", "Informe a data de entrada."]);
  else if (dados.dataEntrada > hojeISO()) e.push([pfx + "-data", "A data de entrada não pode ser no futuro."]);
  if (!dados.quantidade || dados.quantidade < 1 || !Number.isInteger(dados.quantidade)) e.push([pfx + "-qtd", "Informe quantas cabeças (número inteiro)."]);
  if (dados.idadeMeses == null || dados.idadeMeses < 0) e.push([pfx + "-idade", "Informe a idade em meses."]);
  if (!dados.pesoEntrada || dados.pesoEntrada <= 0) e.push([pfx + "-peso", "Informe o peso médio de entrada."]);
  if (idAtual && dados.dataEntrada) {
    const p = pesagensDoLote(S.db, idAtual);
    if (p.length && p[0].data <= dados.dataEntrada) e.push([pfx + "-data", `Já existe pesagem em ${d2(p[0].data)}. A entrada precisa ser antes dela.`]);
  }
  return { dados, ok: erros(form, e) };
}

TELAS.entrada = {
  form: () => `<form class="card" id="fEnt" novalidate>${camposLote()}
    <div class="actions"><button class="btn" type="submit">Cadastrar lote</button><span class="note">O lote entra automaticamente em Lotes ativos.</span></div></form>`,
  ligar() {
    $("#fEnt").onsubmit = (ev) => {
      ev.preventDefault();
      const { dados, ok } = lerLote(ev.target, "e");
      if (!ok) return;
      store.gravar([{ tipo: "set", col: "lotes", id: store.novoId(), dados: { ...dados, ativo: true } }]);
      toast(`Lote ${dados.numero} cadastrado. ${msgSalvo()}`);
      location.hash = "lotes";
    };
  },
  lista: () => {
    const l = [...S.db.lotes].sort((a, b) => b.dataEntrada.localeCompare(a.dataEntrada)).slice(0, 8);
    return `<section class="card"><div class="sec-h"><h3>Últimas entradas</h3></div>
    ${l.length ? `<div class="tw"><table><thead><tr><th>Lote</th><th>Data</th><th class="r">Cab.</th><th>Sexo</th><th>Raça</th><th class="r">Idade</th><th class="r">Peso entrada</th></tr></thead><tbody>
    ${l.map((x) => `<tr class="click" data-act="lote" data-id="${x.id}"><td><span class="lote">${esc(x.numero)}</span></td><td>${d2(x.dataEntrada)}</td><td class="r">${x.quantidade}</td><td>${sexoPill(x.sexo)}</td><td>${esc(x.raca) || "—"}</td><td class="r">${x.idadeMeses} m</td><td class="r">${n0(x.pesoEntrada)} kg</td></tr>`).join("")}
    </tbody></table></div>` : '<p class="empty">Nenhum lote cadastrado ainda.</p>'}</section>`;
  },
};

TELAS.lotes = {
  lista() {
    const hoje = hojeISO();
    const rows = ativos().map((l) => ({ l, pa: pesoAtual(S.db, l), g: ultimoGmd(S.db, l), dd: dias(l.dataEntrada, hoje) }));
    if (!rows.length) return `<section class="card"><h3>Nenhum lote ativo</h3><p class="note">Cadastre um lote em Entrada de lote.</p><div class="actions"><button class="btn" type="button" data-act="ir" data-to="entrada">Cadastrar lote</button></div></section>`;
    return `
    <section class="card desk-only"><div class="tw"><table><thead><tr><th>Lote</th><th class="r">Cab.</th><th>Sexo</th><th>Raça</th><th class="r">Idade entrada</th><th>Entrada</th><th class="r">Peso entrada</th><th class="r">Peso atual</th><th class="r">Ganho total</th><th class="r">GMD último</th><th class="r">Dias</th></tr></thead><tbody>
    ${rows.map(({ l, pa, g, dd }) => `<tr class="click" data-act="lote" data-id="${l.id}"><td><span class="lote">${esc(l.numero)}</span></td><td class="r">${l.quantidade}</td><td>${sexoPill(l.sexo)}</td><td>${esc(l.raca) || "—"}</td><td class="r">${l.idadeMeses} m</td><td>${d2(l.dataEntrada)}</td><td class="r">${n0(l.pesoEntrada)} kg</td><td class="r"><b>${n0(pa.peso)} kg</b><div class="note">${pa.origem === "entrada" ? "sem pesagem" : d2(pa.data)}</div></td><td class="r">${pa.peso - l.pesoEntrada >= 0 ? "+" : ""}${n0(pa.peso - l.pesoEntrada)} kg</td><td class="r ${gmdCls(g)}">${fmtGmd(g)}</td><td class="r">${dd}</td></tr>`).join("")}
    </tbody></table></div></section>
    <div class="lcards">${rows.map(({ l, pa, g, dd }) => `<button type="button" class="card lcard" data-act="lote" data-id="${l.id}">
      <div><div class="row"><span class="lote">${esc(l.numero)}</span>${sexoPill(l.sexo)}</div><div class="sub">${l.quantidade} cabeças${l.raca ? " · " + esc(l.raca) : ""} · ${dd} dias</div></div>
      <div><div class="big num">${n0(pa.peso)}<small style="font-size:14px"> kg</small></div><div class="sub" style="text-align:right">GMD <span class="${gmdCls(g)}">${fmtGmd(g)}</span></div></div>
    </button>`).join("")}</div>
    <p class="note">Toque num lote para ver o histórico completo, corrigir dados ou excluir lançamentos.</p>`;
  },
};

TELAS.saida = {
  form: () => `
    <form class="card" id="fSai" novalidate>
      <div class="fgrid">
        <div class="f"><label for="s-lote">Lote que está saindo</label><select id="s-lote" class="sel-lote">${opcoesLotes(ativos())}</select></div>
        <div class="f"><label for="s-data">Data de saída</label><input id="s-data" type="date" value="${hojeISO()}"></div>
        <div class="f"><label for="s-mot">Motivo</label><select id="s-mot"><option>Venda</option><option>Abate</option><option>Transferência</option><option>Morte</option><option>Outro</option></select></div>
        <div class="f"><label for="s-dest">Destino / comprador</label><input id="s-dest" placeholder="Frigorífico, fazenda, leilão…"></div>
        <div class="f"><label for="s-peso">Peso médio de saída (kg/animal)</label><input id="s-peso" type="number" inputmode="decimal" step="0.1" placeholder="opcional"></div>
        <div class="f"><label for="s-obs">Observação</label><input id="s-obs" placeholder="opcional"></div>
      </div>
      <div class="actions"><button class="btn earth" type="submit">Registrar saída</button><span class="note">O lote sai de Lotes ativos e fica guardado no histórico abaixo.</span></div>
    </form>`,
  atualizarForm: () => atualizarSelect("#s-lote"),
  ligar() {
    $("#fSai").onsubmit = (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const l = lotePorId($("#s-lote").value);
      const data = $("#s-data").value;
      const peso = num($("#s-peso").value);
      const e = [];
      if (!l) e.push(["s-lote", "Escolha o lote."]);
      if (!data) e.push(["s-data", "Informe a data de saída."]);
      else if (l && data < l.dataEntrada) e.push(["s-data", `O lote entrou em ${d2(l.dataEntrada)}. A saída precisa ser depois.`]);
      if ($("#s-peso").value && (!peso || peso <= 0)) e.push(["s-peso", "Peso inválido."]);
      if (!erros(f, e)) return;
      const s = { loteId: l.id, data, motivo: $("#s-mot").value, destino: $("#s-dest").value.trim(), peso: peso || null, quantidade: l.quantidade, obs: $("#s-obs").value.trim() };
      store.gravar([
        { tipo: "set", col: "saidas", id: store.novoId(), dados: s },
        { tipo: "update", col: "lotes", id: l.id, dados: { ativo: false } },
      ]);
      toast(`Saída do ${l.numero} registrada. ${msgSalvo()}`);
      f.reset();
      $("#s-data").value = hojeISO();
    };
  },
  lista() {
    const sa = [...S.db.saidas].sort((a, b) => b.data.localeCompare(a.data));
    return `<section class="card"><div class="sec-h"><h3>Histórico de saídas</h3><span class="note">${sa.length} ${sa.length === 1 ? "lote" : "lotes"}</span></div>
    ${sa.length ? `<div class="tw"><table><thead><tr><th>Lote</th><th>Data</th><th>Motivo</th><th>Destino</th><th class="r">Cab.</th><th class="r">Peso saída</th><th class="r">Dias na fazenda</th></tr></thead><tbody>
    ${sa.map((s) => { const l = lotePorId(s.loteId); return `<tr class="click" data-act="lote" data-id="${s.loteId}"><td><span class="lote">${esc(nomeLote(s.loteId))}</span></td><td>${d2(s.data)}</td><td>${esc(s.motivo)}</td><td>${esc(s.destino) || "—"}</td><td class="r">${s.quantidade}</td><td class="r">${s.peso ? n0(s.peso) + " kg" : "—"}</td><td class="r">${l ? dias(l.dataEntrada, s.data) : "—"}</td></tr>`; }).join("")}
    </tbody></table></div>` : '<p class="empty">Nenhum lote saiu ainda.</p>'}</section>`;
  },
};

TELAS.sanidade = {
  form: () => `
    <form class="card" id="fSan" novalidate>
      <div class="fgrid">
        <div class="f"><label for="v-lote">Lote</label><select id="v-lote" class="sel-lote">${opcoesLotes(ativos())}</select></div>
        <div class="f"><label for="v-data">Data</label><input id="v-data" type="date" value="${hojeISO()}"></div>
        <div class="f"><label for="v-proc">Vacina ou procedimento</label><input id="v-proc" list="procs" autocomplete="off" placeholder="Ex.: Vacina carbúnculo"><datalist id="procs"></datalist></div>
        <div class="f"><label for="v-ml">Dose por animal (ml)</label><input id="v-ml" type="number" inputmode="decimal" step="0.1" placeholder="2"></div>
      </div>
      <div class="actions"><button class="btn" type="submit">Registrar manejo</button><span id="v-tot" class="note"></span></div>
    </form>`,
  atualizarForm() { atualizarSelect("#v-lote"); procs(); },
  ligar() {
    procs();
    const tot = () => {
      const l = lotePorId($("#v-lote").value), ml = num($("#v-ml").value);
      $("#v-tot").textContent = l && ml ? `Total para o lote: ${n1(ml * l.quantidade)} ml (${l.quantidade} animais × ${n1(ml)} ml)` : "";
    };
    $("#v-ml").oninput = tot;
    $("#v-lote").onchange = tot;
    $("#fSan").onsubmit = (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const l = lotePorId($("#v-lote").value);
      const s = { loteId: l?.id, data: $("#v-data").value, procedimento: $("#v-proc").value.trim(), doseMl: num($("#v-ml").value) };
      const e = [];
      if (!l) e.push(["v-lote", "Escolha o lote."]);
      if (!s.data) e.push(["v-data", "Informe a data."]);
      else if (l && s.data < l.dataEntrada) e.push(["v-data", `O lote entrou em ${d2(l.dataEntrada)}.`]);
      if (!s.procedimento) e.push(["v-proc", "Informe a vacina ou o procedimento."]);
      if (s.doseMl == null || s.doseMl < 0) e.push(["v-ml", "Informe a dose em ml."]);
      if (!erros(f, e)) return;
      store.gravar([{ tipo: "set", col: "sanidade", id: store.novoId(), dados: s }]);
      toast(`Manejo registrado no ${l.numero}. ${msgSalvo()}`);
      $("#v-proc").value = ""; $("#v-ml").value = ""; tot();
    };
  },
  lista() {
    const lista = [...S.db.sanidade].filter((s) => !filtroSan || s.loteId === filtroSan).sort((a, b) => b.data.localeCompare(a.data));
    return `<section class="card"><div class="sec-h"><h3>Histórico sanitário</h3>${filtroSelect("filtroSan", filtroSan)}</div>
    ${lista.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Lote</th><th>Vacina / procedimento</th><th class="r">Dose</th><th class="r">Total aplicado</th></tr></thead><tbody>
    ${lista.map((s) => { const l = lotePorId(s.loteId); return `<tr class="click" data-act="lote" data-id="${s.loteId}"><td>${d2(s.data)}</td><td><span class="lote">${esc(nomeLote(s.loteId))}</span></td><td>${esc(s.procedimento)}</td><td class="r">${n1(s.doseMl)} ml</td><td class="r">${l ? n1(s.doseMl * l.quantidade) + " ml" : "—"}</td></tr>`; }).join("")}
    </tbody></table></div>` : '<p class="empty">Nenhum manejo registrado.</p>'}</section>`;
  },
  ligarLista() { ligarFiltro("filtroSan", (v) => { filtroSan = v; }); },
};

function procs() {
  const dl = $("#procs");
  if (dl) dl.innerHTML = [...new Set(S.db.sanidade.map((s) => s.procedimento))].map((p) => `<option value="${esc(p)}">`).join("");
}
function filtroSelect(id, val) {
  const lotes = [...S.db.lotes].sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }));
  return `<select id="${id}" aria-label="Filtrar por lote" style="background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:6px 8px;max-width:50%"><option value="">Todos os lotes</option>${lotes.map((l) => `<option value="${l.id}" ${l.id === val ? "selected" : ""}>${esc(l.numero)}${l.ativo ? "" : " (saiu)"}</option>`).join("")}</select>`;
}
function ligarFiltro(id, set) {
  const el = $("#" + id);
  if (el) el.onchange = () => { set(el.value); $("#lista").innerHTML = TELAS[telaAtual].lista(); TELAS[telaAtual].ligarLista(); };
}
function atualizarSelect(sel) {
  const el = $(sel);
  if (!el) return;
  const v = el.value;
  el.innerHTML = opcoesLotes(ativos(), v);
  el.dispatchEvent(new Event("change"));
}

TELAS.pesagem = {
  form: () => `
    <form class="card" id="fPes" novalidate>
      <div class="fgrid">
        <div class="f"><label for="p-lote">Lote</label><select id="p-lote" class="sel-lote">${opcoesLotes(ativos())}</select></div>
        <div class="f"><label for="p-data">Data da pesagem</label><input id="p-data" type="date" value="${hojeISO()}"></div>
        <div class="f full"><label for="p-peso">Peso médio por animal (kg)</label><input id="p-peso" type="number" inputmode="decimal" step="0.1" placeholder="Digite o peso médio"></div>
      </div>
      <div class="calc" id="calc" aria-live="polite"></div>
      <div class="actions"><button class="btn" type="submit">Salvar pesagem</button><span class="note">O peso atual do lote é atualizado em Lotes ativos.</span></div>
    </form>`,
  atualizarForm() { atualizarSelect("#p-lote"); calcPesagem(); },
  ligar() {
    ["#p-lote", "#p-data", "#p-peso"].forEach((s) => $(s).addEventListener("input", calcPesagem));
    $("#p-lote").addEventListener("change", calcPesagem);
    calcPesagem();
    $("#fPes").onsubmit = (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const l = lotePorId($("#p-lote").value);
      const p = { loteId: l?.id, data: $("#p-data").value, peso: num($("#p-peso").value) };
      const e = [];
      if (!l) e.push(["p-lote", "Escolha o lote."]);
      if (!p.data) e.push(["p-data", "Informe a data."]);
      else if (p.data > hojeISO()) e.push(["p-data", "A data não pode ser no futuro."]);
      else if (l && p.data <= l.dataEntrada) e.push(["p-data", `O lote entrou em ${d2(l.dataEntrada)}. A pesagem precisa ser depois.`]);
      else if (l && pesagensDoLote(S.db, l.id).some((x) => x.data === p.data)) e.push(["p-data", "Já existe pesagem deste lote nessa data. Exclua a anterior no histórico do lote se quiser corrigir."]);
      if (!p.peso || p.peso <= 0) e.push(["p-peso", "Informe o peso médio por animal."]);
      if (!erros(f, e)) return;
      const g = calcGmd(S.db, l, p).gmd;
      store.gravar([{ tipo: "set", col: "pesagens", id: store.novoId(), dados: p }]);
      toast(`Pesagem salva. GMD do ${l.numero}: ${fmtGmd(g)} kg/dia. ${msgSalvo()}`);
      $("#p-peso").value = "";
      calcPesagem();
    };
  },
  lista() {
    const hist = [...S.db.pesagens].filter((p) => !filtroPes || p.loteId === filtroPes).sort((a, b) => b.data.localeCompare(a.data));
    return `<section class="card"><div class="sec-h"><h3>Histórico de pesagens</h3>${filtroSelect("filtroPes", filtroPes)}</div>
    ${hist.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Lote</th><th class="r">Peso médio</th><th>Comparado com</th><th class="r">Ganho</th><th class="r">Dias</th><th class="r">GMD</th></tr></thead><tbody>
    ${hist.map((p) => {
      const l = lotePorId(p.loteId);
      if (!l) return "";
      const c = calcGmd(S.db, l, p);
      return `<tr class="click" data-act="lote" data-id="${l.id}"><td>${d2(p.data)}</td><td><span class="lote">${esc(l.numero)}</span>${l.ativo ? "" : ' <span class="pill">saiu</span>'}</td><td class="r">${n0(p.peso)} kg</td><td class="note">${c.ref.tipo} ${d2(c.ref.data)}</td><td class="r">${c.ganho >= 0 ? "+" : ""}${n1(c.ganho)} kg</td><td class="r">${c.dias}</td><td class="r ${gmdCls(c.gmd)}">${fmtGmd(c.gmd)}</td></tr>`;
    }).join("")}
    </tbody></table></div>` : '<p class="empty">Nenhuma pesagem registrada.</p>'}</section>`;
  },
  ligarLista() { ligarFiltro("filtroPes", (v) => { filtroPes = v; }); },
};

function calcPesagem() {
  const box = $("#calc");
  if (!box) return;
  const l = lotePorId($("#p-lote").value), data = $("#p-data").value, peso = num($("#p-peso").value);
  if (!l) { box.innerHTML = '<span class="formula">Nenhum lote ativo. Cadastre um lote em Entrada de lote.</span>'; return; }
  if (!data) { box.innerHTML = '<span class="formula">Informe a data da pesagem.</span>'; return; }
  const a = referenciaAnterior(S.db, l, data);
  const dd = dias(a.data, data);
  const g = peso && dd > 0 ? (peso - a.peso) / dd : null;
  box.innerHTML = `
    <div><span class="label">${a.tipo}</span><b>${n0(a.peso)} kg</b><span class="note">${d2(a.data)}</span></div>
    <div><span class="label">Ganho</span><b>${peso ? (peso - a.peso >= 0 ? "+" : "") + n1(peso - a.peso) : "—"} kg</b></div>
    <div><span class="label">Dias</span><b>${dd}</b></div>
    <div class="res"><span class="label">GMD calculado</span><b class="${gmdCls(g)}">${fmtGmd(g)}</b><span class="note">kg/animal/dia</span></div>
    <span class="formula">GMD = (${peso ? n1(peso) : "peso novo"} − ${n1(a.peso)}) ÷ ${dd} dias. Sem pesagem anterior, o sistema usa o peso de entrada.</span>`;
}

// ------------------------------------------------------------ detalhe do lote
function abrirLote(id) { drawer = { loteId: id, editando: false }; renderDrawer(); }
function fecharLote() { drawer = null; $("#layer").innerHTML = ""; }
addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer) fecharLote(); });

function renderDrawer() {
  const l = drawer && lotePorId(drawer.loteId);
  if (!l) { fecharLote(); return; }
  const pa = pesoAtual(S.db, l), g = ultimoGmd(S.db, l), sai = saidaDoLote(S.db, l.id);
  const pes = pesagensDoLote(S.db, l.id);
  const san = S.db.sanidade.filter((s) => s.loteId === l.id);
  const evs = [
    { k: "ent", data: l.dataEntrada, t: "Entrada", x: `${l.quantidade} ${l.sexo === "M" ? "machos" : "fêmeas"}${l.raca ? " " + l.raca : ""} · ${l.idadeMeses} meses · ${n0(l.pesoEntrada)} kg/animal${l.obs ? "\nObs.: " + l.obs : ""}` },
    ...pes.map((p) => ({ k: "peso", col: "pesagens", id: p.id, data: p.data, t: `${n0(p.peso)} kg/animal`, x: `GMD ${fmtGmd(calcGmd(S.db, l, p).gmd)} kg/dia` })),
    ...san.map((s) => ({ k: "san", col: "sanidade", id: s.id, data: s.data, t: s.procedimento, x: `${n1(s.doseMl)} ml por animal · ${n1(s.doseMl * l.quantidade)} ml no lote` })),
    ...(sai ? [{ k: "ent", data: sai.data, t: `Saída · ${sai.motivo}`, x: [sai.destino, sai.peso ? n0(sai.peso) + " kg/animal" : "", sai.obs].filter(Boolean).join(" · ") }] : []),
  ].sort((a, b) => b.data.localeCompare(a.data));
  const lab = { ent: "Lote", peso: "Pesagem", san: "Sanidade" };
  const podeExcluirLote = !pes.length && !san.length && !sai;

  const corpo = drawer.editando
    ? `<form class="card" id="fEdit" novalidate><h3>Corrigir dados do lote</h3>${camposLote(l, "ed")}
        <div class="actions"><button class="btn" type="submit">Salvar alterações</button><button class="btn ghost" type="button" id="cancelEdit">Cancelar</button></div></form>`
    : `<div class="facts"><div><span class="label">${sai && sai.peso ? "Peso na saída" : "Peso atual"}</span><b class="num">${n0(sai && sai.peso ? sai.peso : pa.peso)} kg</b></div><div><span class="label">GMD último</span><b class="num ${gmdCls(g)}">${fmtGmd(g)}</b></div><div><span class="label">Dias</span><b class="num">${dias(l.dataEntrada, sai ? sai.data : hojeISO())}</b></div></div>
       <div class="actions">
         <button class="btn ghost" type="button" id="editLote">Corrigir dados do lote</button>
         ${sai ? '<button class="btn ghost" type="button" id="desfazSaida" data-confirm="Confirmar: voltar para ativos">Desfazer saída</button>' : ""}
         ${podeExcluirLote ? '<button class="mini danger" type="button" id="excluiLote" data-confirm="Confirmar exclusão do lote">Excluir lote</button>' : ""}
       </div>
       <section class="card"><div class="sec-h"><h3>Histórico completo</h3></div><div class="timeline">
         ${evs.map((e) => `<div class="ev"><span class="d">${d2(e.data)}</span><div><span class="tag ${e.k}">${lab[e.k]}</span><div class="t">${esc(e.t)}</div><div class="x">${esc(e.x)}</div>${e.id ? `<div class="acts"><button class="mini danger" type="button" data-del="${e.col}" data-id="${e.id}" data-confirm="Confirmar exclusão">Excluir</button></div>` : ""}</div></div>`).join("")}
       </div></section>`;

  $("#layer").innerHTML = `<div class="scrim" id="scrim"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label="Lote ${esc(l.numero)}">
    <div class="dh"><div><div class="label">${l.ativo ? "Lote ativo" : "Lote no histórico de saídas"}</div><h2>${esc(l.numero)}</h2><div style="display:flex;gap:8px;margin-top:4px;align-items:center;flex-wrap:wrap">${sexoPill(l.sexo)}<span class="note">${l.quantidade} cabeças${l.raca ? " · " + esc(l.raca) : ""} · entrou em ${d2(l.dataEntrada)}</span></div></div>
    <button class="btn ghost" type="button" id="fechaLote">Fechar</button></div>
    ${corpo}
  </aside>`;

  $("#scrim").onclick = fecharLote;
  $("#fechaLote").onclick = fecharLote;
  if (drawer.editando) {
    $("#cancelEdit").onclick = () => { drawer.editando = false; renderDrawer(); };
    $("#fEdit").onsubmit = (ev) => {
      ev.preventDefault();
      const { dados, ok } = lerLote(ev.target, "ed", l.id);
      if (!ok) return;
      drawer.editando = false;
      store.gravar([{ tipo: "update", col: "lotes", id: l.id, dados }]);
      toast(`Lote ${dados.numero} atualizado. ${msgSalvo()}`);
    };
    return;
  }
  $("#editLote").onclick = () => { drawer.editando = true; renderDrawer(); $("#ed-num").focus(); };

  // Botões que pedem confirmação: o 1º toque troca o texto, o 2º executa.
  const confirmar = (btn, acao) => {
    btn.onclick = () => {
      if (btn.dataset.armado) { acao(); return; }
      btn.dataset.armado = "1";
      btn.dataset.txt = btn.textContent;
      btn.textContent = btn.dataset.confirm;
      setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armado; btn.textContent = btn.dataset.txt; } }, 4000);
    };
  };
  const bSaida = $("#desfazSaida");
  if (bSaida) confirmar(bSaida, () => {
    store.gravar([{ tipo: "delete", col: "saidas", id: sai.id }, { tipo: "update", col: "lotes", id: l.id, dados: { ativo: true } }]);
    toast(`Saída desfeita. ${l.numero} voltou para os lotes ativos.`);
  });
  const bLote = $("#excluiLote");
  if (bLote) confirmar(bLote, () => {
    store.gravar([{ tipo: "delete", col: "lotes", id: l.id }]);
    fecharLote();
    toast(`Lote ${l.numero} excluído.`);
  });
  document.querySelectorAll("[data-del]").forEach((b) => confirmar(b, () => {
    store.gravar([{ tipo: "delete", col: b.dataset.del, id: b.dataset.id }]);
    toast("Lançamento excluído.");
  }));
}

// ------------------------------------------------------------ app instalável / offline
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

render();
