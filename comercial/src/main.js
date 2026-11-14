// Casca do sistema: entrada, bloqueios, menu, abas e as telas de conta e de assinantes.
import { ultimoEmail, assinaturaAtiva } from "./store.js";
import { LINK_ASSINAR } from "./firebase-config.js";
import {
  store, S, ui, $, $$, esc, d2, icon, toast, erros, confirmar, nomeFazenda, TELAS, MODS, definirAoMudar,
} from "./base.js";
import { abrirLote, fecharLote, renderDrawer, drawerAberto, drawerEditando } from "./drawer.js";
import "./telas-lotes.js";
import "./telas-pasto.js";
import "./telas-pesagem.js";
import "./telas-sanidade.js";
import "./telas-trato.js";
import "./telas-custos.js";
import "./telas-saida.js";

const LOGO = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="9" fill="#F4B92F"/><path d="M8 22V10M8 22h7M18 16.5l3 3.5 5-8" stroke="#241A02" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const dataHora = (ms) => new Date(ms).toLocaleDateString("pt-BR");

// ------------------------------------------------------------ navegação
const EXTRA = { conta: "Conta e fazendas" };
function rota() {
  const [m, a] = location.hash.slice(1).split("/");
  if (EXTRA[m]) return { mod: null, k: m, chave: m, titulo: EXTRA[m] };
  const mod = MODS.find((x) => x.k === m) || MODS[0];
  const aba = mod.abas ? (mod.abas.find((x) => x[0] === a) || mod.abas[0])[0] : null;
  return { mod, k: mod.k, aba, chave: aba ? `${mod.k}/${aba}` : mod.k, titulo: mod.l };
}
let portao = "";      // qual tela de bloqueio está montada (para não redesenhar enquanto a pessoa digita)
let telaAtual = null; // qual tela está montada
let assinatura = "";  // muda quando os dados mudam
let maisAberto = false;

let agendado = false;
function agendar() {
  if (agendado) return;
  agendado = true;
  requestAnimationFrame(() => { agendado = false; render(); });
}
definirAoMudar(agendar);
addEventListener("hashchange", () => { telaAtual = null; portao = ""; maisAberto = false; if (!drawerAberto()) $("#layer").innerHTML = ""; render(); scrollTo(0, 0); });

// ------------------------------------------------------------ casca
const NA_BARRA = ["painel", "lotes", "pasto", "pesagem"];

function render() {
  const root = $("#root");
  if (S.modo === "nuvem" && S.usuario === undefined) {
    root.innerHTML = '<div class="loading">Carregando…</div>';
    telaAtual = null;
    return;
  }
  if (S.modo === "nuvem" && S.usuario === null) { portao = ""; telaLogin(root); return; }
  if (S.admin && location.hash === "#admin") { telaAdmin(root); return; }
  if (!S.conta || S.assinatura === undefined) {
    if (S.erro && S.erro !== "sem-acesso") { telaBloqueio(root, "erro"); return; }
    root.innerHTML = '<div class="loading">Verificando a assinatura…</div>'; telaAtual = null; portao = ""; return;
  }
  if (!assinaturaAtiva(S.assinatura)) { telaBloqueio(root, "assinatura"); return; }
  if (S.fazendas === null) { root.innerHTML = '<div class="loading">Buscando as fazendas…</div>'; telaAtual = null; portao = ""; return; }
  if (!S.fazendas.length) { telaBloqueio(root, S.erroFazendas ? "erro" : "fazenda"); return; }
  portao = "";

  if (!$(".app", root)) {
    root.innerHTML = `
    <div class="app">
      <aside class="side">
        <div class="brand"><div class="logo">${LOGO}Lote Certo</div><b id="fazNome"></b><select id="fazSel" class="fazsel" aria-label="Trocar de fazenda" hidden></select></div>
        <nav class="nav" id="nav" aria-label="Menu"></nav>
        <div class="acts">
          <button type="button" data-act="excel">${icon("excel")} Baixar planilha Excel</button>
          <button type="button" data-act="ir" data-to="conta">${icon("conta")} Conta e fazendas</button>
          ${S.admin ? `<button type="button" data-act="ir" data-to="admin">${icon("painel")} Assinantes</button>` : ""}
          ${S.modo === "nuvem" ? `<button type="button" data-act="sair">${icon("sair")} Sair</button>` : ""}
        </div>
        <div class="user" id="userSide"></div>
      </aside>
      <div class="main">
        <header class="top">
          <a class="farm" id="fazTop" href="#conta"></a>
          <h1 id="title"></h1>
          <div class="sync" id="sync" role="status"><span class="dot"></span><span id="syncTxt"></span></div>
        </header>
        <main class="content">
          <div id="avisos"></div>
          <nav class="abas" id="abas" aria-label="Abas desta área"></nav>
          <div id="form"></div>
          <div id="lista"></div>
        </main>
      </div>
      <nav class="tabbar" id="tabbar" aria-label="Áreas"></nav>
    </div>`;
    telaAtual = null;
  }

  const r = rota();
  $("#nav").innerHTML = MODS.map((m) => `<a href="#${m.k}" ${m.k === r.k ? 'aria-current="page"' : ""}>${icon(m.k)}<span>${m.l}</span></a>`).join("");
  const naBarra = NA_BARRA.includes(r.k);
  $("#tabbar").innerHTML = MODS.filter((m) => NA_BARRA.includes(m.k)).map((m) =>
    `<a href="#${m.k}" ${m.k === r.k ? 'aria-current="page"' : ""}>${icon(m.k)}<span>${m.s}</span></a>`).join("")
    + `<button type="button" data-act="mais" ${naBarra ? "" : 'aria-current="page"'}>${icon("mais")}<span>${naBarra ? "Mais" : esc(r.mod ? r.mod.s : "Conta")}</span></button>`;
  $("#title").textContent = r.titulo;
  $("#abas").innerHTML = r.mod && r.mod.abas ? r.mod.abas.map(([k, l]) => `<a href="#${r.mod.k}/${k}" ${k === r.aba ? 'aria-current="page"' : ""}>${l}</a>`).join("") : "";
  $("#fazNome").textContent = nomeFazenda();
  $("#fazTop").textContent = nomeFazenda() + (S.fazendas.length > 1 ? " ▾" : "");
  const sel = $("#fazSel"), selH = JSON.stringify([S.fazendas, S.fazendaId]);
  if (sel.dataset.h !== selH) {
    sel.dataset.h = selH;
    sel.hidden = S.fazendas.length < 2;
    sel.innerHTML = S.fazendas.map((f) => `<option value="${f.id}" ${f.id === S.fazendaId ? "selected" : ""}>${esc(f.nome)}</option>`).join("");
    sel.onchange = () => trocarFazenda(sel.value);
  }
  $("#userSide").textContent = S.modo === "nuvem" ? S.usuario.email : "";
  renderStatus();
  renderAvisos();

  const novaAss = JSON.stringify([S.db, S.fazendas, S.fazendaId, S.membros, S.assinatura]);
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
    telaAtual = null;
    return;
  }

  const T = TELAS[r.chave];
  if (telaAtual !== r.chave) {
    telaAtual = r.chave;
    $("#form").innerHTML = T.form ? T.form() : "";
    T.ligar && T.ligar();
    $("#lista").innerHTML = T.lista ? T.lista() : "";
    T.ligarLista && T.ligarLista();
  } else if (dadosMudaram) {
    T.atualizarForm && T.atualizarForm();
    $("#lista").innerHTML = T.lista ? T.lista() : "";
    T.ligarLista && T.ligarLista();
  }
  if (drawerAberto() && !drawerEditando() && (dadosMudaram || !$(".drawer"))) renderDrawer();
}
/** Refaz só a lista da tela atual (filtros). */
ui.refazerLista = function refazerLista() {
  const T = TELAS[telaAtual];
  if (!T) return;
  $("#lista").innerHTML = T.lista ? T.lista() : "";
  T.ligarLista && T.ligarLista();
};

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
    t.textContent = "Online · tudo salvo";
  }
}

function renderAvisos() {
  const a = $("#avisos");
  let h = "";
  if (S.modo === "demo") {
    h = `<div class="banner"><span><b>Modo demonstração.</b> Os dados ficam só neste aparelho e começam com exemplos.</span><button class="mini" type="button" data-act="restaurar">Restaurar exemplos</button></div>`;
  } else if (S.erro === "sem-acesso") {
    h = `<div class="banner bad"><span>A conta <b>${esc(S.usuario?.email)}</b> não conseguiu ler ou gravar os dados. A assinatura pode ter vencido ou o acesso foi removido.</span><button class="mini" type="button" data-act="sair">Trocar de conta</button></div>`;
  } else if (S.erro) {
    h = `<div class="banner bad"><span>${esc(S.erro)}</span></div>`;
  }
  if (a.dataset.h !== h) { a.innerHTML = h; a.dataset.h = h; }
}

function telaLogin(root) {
  telaAtual = null;
  root.innerHTML = `
  <div class="login"><div class="box">
    <div class="logo">${LOGO}Lote Certo</div>
    <h1>Cada lote <em>na conta certa.</em></h1>
    <p>Entre com a sua conta Google para ver e lançar os dados das suas fazendas.</p>
    <div class="actions"><button class="btn" type="button" id="btnEntrar">${ultimoEmail() ? "Entrar como " + esc(ultimoEmail()) : "Entrar com Google"}</button></div>
    ${ultimoEmail() ? '<p style="font-size:13px">Depois de entrar, o sistema fica conectado neste aparelho até você tocar em Sair.</p>' : ""}
    ${navigator.onLine ? "" : '<div class="err">Você está sem internet. O primeiro acesso em cada aparelho precisa de conexão. Depois disso o sistema funciona sem internet.</div>'}
    <div id="loginErr"></div>
    <p style="font-size:14px"><a href="../">Ainda não é assinante? Conheça o Lote Certo</a></p>
  </div></div>`;
  $("#btnEntrar").onclick = async () => {
    try { await store.entrar(); }
    catch (e) { $("#loginErr").innerHTML = `<div class="err">Não foi possível entrar: ${esc(e.message)}</div>`; }
  };
}

function abrirMais() {
  maisAberto = true;
  const r = rota();
  $("#layer").innerHTML = `<div class="scrim" data-act="fechar-mais"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="Mais áreas">
    ${MODS.filter((m) => !NA_BARRA.includes(m.k)).map((m) => `<a href="#${m.k}" ${m.k === r.k ? 'aria-current="page"' : ""}>${icon(m.k)}${m.l}</a>`).join("")}
    <hr>
    <a href="#conta" ${r.k === "conta" ? 'aria-current="page"' : ""}>${icon("conta")}Conta e fazendas</a>
    <button type="button" data-act="excel">${icon("excel")}Baixar planilha Excel</button>
    ${S.admin ? `<a href="#admin">${icon("painel")}Assinantes</a>` : ""}
    ${S.modo === "nuvem" ? `<button type="button" data-act="sair">${icon("sair")}Sair</button>` : ""}
  </div>`;
}
function fecharMais() { maisAberto = false; if (!drawerAberto()) $("#layer").innerHTML = ""; }

// ------------------------------------------------------------ ações gerais
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "excel") {
    b.disabled = true;
    try {
      const { baixarPlanilha } = await import("./excel.js");
      await baixarPlanilha(S.db, nomeFazenda());
      toast("Planilha gerada com todos os dados do sistema.");
    } catch (err) {
      toast("Não foi possível gerar a planilha: " + err.message);
    } finally { b.disabled = false; if (maisAberto) fecharMais(); }
  } else if (act === "sair") {
    if (maisAberto) fecharMais();
    await store.sair();
  } else if (act === "restaurar") {
    store.restaurarExemplo && store.restaurarExemplo();
    toast("Exemplos restaurados.");
  } else if (act === "lote") {
    abrirLote(b.dataset.id);
  } else if (act === "usar-fazenda") {
    trocarFazenda(b.dataset.id);
    toast("Fazenda aberta.");
  } else if (act === "tirar-membro") {
    try { await store.removerMembro(b.dataset.email); toast("Acesso removido."); }
    catch (err) { toast("Não foi possível remover: " + err.message); }
  } else if (act === "ir") {
    location.hash = b.dataset.to;
  } else if (act === "mais") {
    abrirMais();
  } else if (act === "fechar-mais") {
    fecharMais();
  }
});
addEventListener("keydown", (e) => { if (e.key === "Escape") { if (drawerAberto()) fecharLote(); else if (maisAberto) fecharMais(); } });

// ------------------------------------------------------------ fazendas, conta e assinatura
function trocarFazenda(id) {
  if (drawerAberto()) fecharLote();
  telaAtual = null;
  store.escolherFazenda(id);
}

// Telas que aparecem antes do sistema: sem assinatura ativa, primeira fazenda, erro.
function telaBloqueio(root, tipo) {
  const chave = tipo + "|" + (S.usuario?.email || "") + "|" + JSON.stringify(S.assinatura) + "|" + S.admin + "|" + (S.conta?.id || "") + "|" + (S.erro || "");
  if (portao === chave) return;
  portao = chave; telaAtual = null;
  const rodape = `<p style="font-size:13px">Conectado como ${esc(S.usuario?.email)} · <button class="link" type="button" data-act="sair">Sair</button>${S.admin ? ' · <a href="#admin">Assinantes</a>' : ""}</p>`;
  let h;
  if (tipo === "fazenda") {
    h = S.conta.minha ? `
      <span class="label">Assinatura ativa</span>
      <h1 class="md">Qual é o nome da sua fazenda?</h1>
      <p>É o nome que aparece no painel e na planilha Excel. Você pode mudar depois e cadastrar outras fazendas.</p>
      <form id="fFaz1" novalidate style="display:flex;flex-direction:column;gap:14px">
        <div class="f"><label for="faz1">Nome da fazenda</label><input id="faz1" autocomplete="off" placeholder="Ex.: Fazenda Boa Vista" style="color:var(--ink)"></div>
        <div class="actions"><button class="btn" type="submit">Começar a usar</button></div>
      </form>` : `
      <h1 class="md">Nenhuma fazenda ainda</h1>
      <p>${esc(S.conta.donoNome || "O dono da conta")} ainda não cadastrou nenhuma fazenda. Assim que cadastrar, ela aparece aqui.</p>`;
  } else if (tipo === "erro") {
    h = `<h1 class="md">Não foi possível abrir</h1><div class="err">${esc(S.erro)}</div><p>Confira a internet e abra de novo.</p>`;
  } else {
    const a = S.assinatura;
    const venceu = a && a.ativa && a.ate && a.ate <= Date.now();
    h = `
      <div class="logo">${LOGO}Lote Certo</div>
      <h1 class="md">${venceu ? "Sua assinatura venceu" : a && !a.ativa ? "Assinatura pausada" : "Falta ativar a assinatura"}</h1>
      ${S.conta.minha
        ? `<p>${venceu ? `O acesso valia até ${dataHora(a.ate)}. Renove para voltar a usar. Seus dados continuam guardados.` : "O Lote Certo é liberado para assinantes. Assine para cadastrar suas fazendas e seus lotes."}</p>
           <div class="actions">${LINK_ASSINAR ? `<a class="btn" href="${esc(LINK_ASSINAR)}" target="_blank" rel="noopener">${venceu ? "Renovar assinatura" : "Assinar agora"}</a>` : `<a class="btn" href="../#planos">Ver a assinatura</a>`}</div>
           <p style="font-size:14px">Já pagou? A liberação é feita para o e-mail <b>${esc(S.usuario.email)}</b>. Se você comprou com outro e-mail, avise o suporte. Esta tela se atualiza sozinha quando o acesso for liberado.</p>`
        : `<p>Você usa a conta de ${esc(S.conta.donoNome || "outra pessoa")}, e a assinatura dela não está ativa no momento.</p>`}`;
  }
  const aviso = S.erro && tipo !== "erro"
    ? `<div class="err">${S.erro === "sem-acesso" ? "O banco recusou a gravação. Feche e abra o sistema de novo. Se continuar, avise o suporte." : esc(S.erro)}</div>` : "";
  root.innerHTML = `<div class="login"><div class="box">${h}${aviso}${rodape}</div></div>`;
  const f = $("#fFaz1");
  if (f) f.onsubmit = (ev) => {
    ev.preventDefault();
    const nome = $("#faz1").value.trim();
    if (!erros(f, nome ? [] : [["faz1", "Informe o nome da fazenda."]])) return;
    const bt = f.querySelector("button[type=submit]");
    bt.disabled = true; bt.textContent = "Criando a fazenda…";
    store.criarFazenda(nome, true);
    if (location.hash !== "#painel") location.hash = "painel";
  };
}

/** Fazendas com o nome igual ao de outra. Fica de fora a que está aberta (ou a mais antiga de cada nome). */
function repetidas() {
  const grupos = new Map();
  for (const f of S.fazendas) {
    const k = String(f.nome || "").trim().toLowerCase();
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(f);
  }
  const fora = [];
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    const fica = g.find((f) => f.id === S.fazendaId) || [...g].sort((a, b) => String(a.criadoEm || "").localeCompare(String(b.criadoEm || "")))[0];
    fora.push(...g.filter((f) => f !== fica));
  }
  return fora;
}

TELAS.conta = {
  lista() {
    const a = S.assinatura;
    const dono = S.conta.minha;
    return `
    <section class="card"><div class="sec-h"><h3>Fazendas</h3><span class="note">${S.fazendas.length} ${S.fazendas.length === 1 ? "fazenda" : "fazendas"}</span></div>
      ${dono && repetidas().length ? `<div class="banner" style="margin-bottom:12px"><span><b>${repetidas().length} ${repetidas().length === 1 ? "fazenda repetida" : "fazendas repetidas"}</b> com o mesmo nome de outra. As que não têm nenhum lançamento podem ser apagadas de uma vez.</span><button class="btn sm" type="button" id="limparFaz" data-confirm="Confirmar: apagar as repetidas vazias">Apagar as repetidas vazias</button></div>` : ""}
      <div class="rows">${S.fazendas.map((f) => `
        <div class="item faz"><div class="ih"><div><b>${esc(f.nome)}</b>${f.id === S.fazendaId ? ' <span class="pill m">Em uso</span>' : ""}</div>
          <div class="actions">${f.id === S.fazendaId ? "" : `<button class="btn sm" type="button" data-act="usar-fazenda" data-id="${f.id}">Abrir esta</button>`}</div></div>
          ${dono ? `<details class="mais"><summary>Mudar o nome${f.id === S.fazendaId ? "" : " ou excluir"}</summary>
          <form class="rowf" data-faz="${f.id}" novalidate>
            <div class="f"><label for="fz-${f.id}">Nome</label><input id="fz-${f.id}" value="${esc(f.nome)}" autocomplete="off"></div>
            <button class="btn ghost sm" type="submit">Salvar nome</button>
            ${f.id === S.fazendaId ? "" : `<button class="mini danger" type="button" data-excluir-faz="${f.id}" data-confirm="Confirmar exclusão da fazenda">Excluir fazenda</button>`}
          </form>${f.id === S.fazendaId ? "" : '<p class="note" style="margin-top:8px">Só dá para excluir uma fazenda sem nenhum lançamento.</p>'}</details>` : ""}
        </div>`).join("")}</div>
      ${dono ? `<form class="rowf" id="fNovaFaz" novalidate style="margin-top:14px;border-top:1px solid var(--line);padding-top:14px">
        <div class="f"><label for="nf-nome">Nova fazenda</label><input id="nf-nome" autocomplete="off" placeholder="Nome da fazenda"></div>
        <button class="btn" type="submit">Cadastrar fazenda</button></form>` : ""}
      <p class="note" style="margin-top:10px">Cada fazenda tem seus próprios lotes, pastos, catálogos, custos e planilha.</p>
    </section>
    ${S.modo === "nuvem" && dono ? `
    <section class="card"><div class="sec-h"><h3>Sócio ou funcionário</h3><span class="note">${S.membros.length} com acesso</span></div>
      <p class="note">Quem você incluir aqui entra com a própria conta Google e passa a ver e lançar nas suas fazendas. A pessoa não precisa de outra assinatura.</p>
      ${S.membros.length ? `<div class="rows" style="margin-top:10px">${S.membros.map((m) => `<div class="rowf"><b style="overflow-wrap:anywhere">${esc(m.email)}</b><button class="mini danger" type="button" data-act="tirar-membro" data-email="${esc(m.email)}">Remover acesso</button></div>`).join("")}</div>` : ""}
      <form class="rowf" id="fMembro" novalidate style="margin-top:14px">
        <div class="f"><label for="mb-email">E-mail Google da pessoa</label><input id="mb-email" type="email" inputmode="email" autocomplete="off" placeholder="nome@gmail.com"></div>
        <button class="btn" type="submit">Dar acesso</button></form>
    </section>` : ""}
    <section class="card"><div class="sec-h"><h3>Assinatura</h3></div>
      ${S.modo === "demo" ? '<p class="note">Modo demonstração: sem conta e sem assinatura.</p>' : `
      <div class="facts" style="grid-template-columns:1fr 1fr;margin-bottom:10px"><div><span class="label">Situação</span><b>Ativa</b></div><div><span class="label">Vale até</span><b>${a && a.ate ? dataHora(a.ate) : "Sem prazo"}</b></div></div>
      <p class="note">${dono ? `Conta ${esc(S.usuario.email)}.` : `Você entrou como ${esc(S.usuario.email)} e usa a conta de ${esc(S.conta.donoNome || "outra pessoa")}.`} <button class="link" type="button" data-act="sair">Sair</button>${S.admin ? ' · <a class="link" href="#admin">Assinantes</a>' : ""}</p>`}
    </section>`;
  },
  ligarLista() {
    $$("form[data-faz]").forEach((f) => {
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const id = f.dataset.faz, nome = $("#fz-" + id).value.trim();
        if (!erros(f, nome ? [] : [["fz-" + id, "Informe o nome."]])) return;
        store.renomearFazenda(id, nome);
        toast("Nome da fazenda atualizado.");
      };
    });
    $$("[data-excluir-faz]").forEach((b) => confirmar(b, async () => {
      const f = S.fazendas.find((x) => x.id === b.dataset.excluirFaz);
      b.disabled = true; b.textContent = "Conferindo…";
      try { await store.excluirFazenda(f.id); toast(`${f.nome} excluída.`); }
      catch (err) { b.disabled = false; b.textContent = "Excluir fazenda"; toast(err.message === "Esta fazenda tem lançamentos." ? `${f.nome} tem lançamentos e não pode ser excluída.` : "Não foi possível excluir: " + err.message); }
    }));
    confirmar($("#limparFaz"), async () => {
      const b = $("#limparFaz"), lista = repetidas();
      b.disabled = true;
      let apagadas = 0, comDados = 0, falhas = 0;
      for (const [i, f] of lista.entries()) {
        b.textContent = `Conferindo ${i + 1} de ${lista.length}…`;
        try { await store.excluirFazenda(f.id); apagadas++; }
        catch (err) { if (err.message === "Esta fazenda tem lançamentos.") comDados++; else falhas++; }
      }
      toast(`${apagadas} ${apagadas === 1 ? "fazenda repetida apagada" : "fazendas repetidas apagadas"}.${comDados ? ` ${comDados} com lançamentos ficaram.` : ""}${falhas ? ` ${falhas} não puderam ser apagadas agora. Confira a internet.` : ""}`);
    });
    const nf = $("#fNovaFaz");
    if (nf) nf.onsubmit = (ev) => {
      ev.preventDefault();
      const nome = $("#nf-nome").value.trim();
      if (!erros(nf, nome ? [] : [["nf-nome", "Informe o nome da fazenda."]])) return;
      if (S.fazendas.some((f) => String(f.nome).trim().toLowerCase() === nome.toLowerCase())) { erros(nf, [["nf-nome", "Já existe uma fazenda com esse nome."]]); return; }
      telaAtual = null;
      store.criarFazenda(nome);
      toast(`${nome} cadastrada. Ela já está aberta.`);
    };
    const fm = $("#fMembro");
    if (fm) fm.onsubmit = async (ev) => {
      ev.preventDefault();
      const em = $("#mb-email").value.trim().toLowerCase();
      const e = [];
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) e.push(["mb-email", "Informe um e-mail válido."]);
      else if (em === String(S.usuario.email).toLowerCase()) e.push(["mb-email", "Este é o seu próprio e-mail."]);
      if (!erros(fm, e)) return;
      try { await store.convidar(em); toast(`${em} agora tem acesso às suas fazendas.`); }
      catch (err) { erros(fm, [["mb-email", err.code === "permission-denied" ? "Este e-mail já usa a conta de outra pessoa." : "Não foi possível dar acesso: " + err.message]]); }
    };
  },
};

// Tela só do administrador: liberar ou bloquear o acesso de cada conta.
function telaAdmin(root) {
  store.ouvirAdmin();
  const chave = "admin|" + JSON.stringify(S.adminContas);
  if (portao === chave) return;
  portao = chave; telaAtual = null;
  const lista = S.adminContas;
  const situacao = (a) => !a ? '<span class="pill">Sem assinatura</span>' : !a.ativa ? '<span class="pill f">Bloqueada</span>'
    : a.ate && a.ate <= Date.now() ? '<span class="pill f">Vencida</span>' : '<span class="pill m">Ativa</span>';
  const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  root.innerHTML = `<div class="adm"><header><div><span class="kicker">Lote Certo · administração</span><h1>Assinantes</h1></div><a class="btn ghost" href="#painel">Voltar ao sistema</a></header>
    <p class="note">Toda pessoa que entra com o Google aparece aqui. Libere o acesso de quem pagou. Deixe a data em branco para liberar sem prazo.</p>
    ${lista === null ? '<div class="loading">Buscando as contas…</div>' : !lista.length ? '<p class="empty">Ninguém entrou ainda.</p>' : `
    <div class="rows">${lista.map((c) => `
      <form class="card rowf" data-conta="${c.id}" novalidate>
        <div style="flex:2;min-width:200px"><b style="overflow-wrap:anywhere">${esc(c.email)}</b><div class="note">${esc(c.nome) || "sem nome"} · último acesso ${c.atualizadoEm ? d2(c.atualizadoEm.slice(0, 10)) : "—"}</div><div style="margin-top:6px">${situacao(c.assinatura)}${c.assinatura?.ate ? ` <span class="note">até ${dataHora(c.assinatura.ate)}</span>` : ""}</div></div>
        <div class="f"><label for="ate-${c.id}">Vale até</label><input id="ate-${c.id}" type="date" value="${c.assinatura?.ate ? iso(c.assinatura.ate) : ""}"></div>
        <button class="btn" type="submit" data-ativa="1">${c.assinatura?.ativa ? "Atualizar" : "Liberar acesso"}</button>
        ${c.assinatura?.ativa ? '<button class="btn ghost" type="submit" data-ativa="0">Bloquear</button>' : ""}
      </form>`).join("")}</div>`}
  </div>`;
  $$("form[data-conta]", root).forEach((f) => {
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const ativa = ev.submitter?.dataset.ativa !== "0";
      try {
        await store.definirAssinatura(f.dataset.conta, { ativa, ate: $("#ate-" + f.dataset.conta).value });
        toast(ativa ? "Acesso liberado." : "Acesso bloqueado.");
      } catch (err) { toast("Não foi possível salvar: " + err.message); }
    };
  });
}

// ------------------------------------------------------------ app instalável / offline
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

render();
