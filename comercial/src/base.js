// Peças usadas por todas as telas: dados, formatação, formulários e avisos.
import { criarStore } from "./store.js";
import { hojeISO, modelo } from "./calc.js";

let aoMudar = () => {};
export const definirAoMudar = (f) => { aoMudar = f; };
let _modelo = null;
export const store = criarStore(() => { _modelo = null; aoMudar(); });
export const S = store.S;

/** Todas as contas do sistema para hoje. Refeito só quando os dados mudam. */
export function M() {
  const h = hojeISO();
  if (!_modelo || _modelo.hoje !== h) _modelo = modelo(S.db, h);
  return _modelo;
}

// ------------------------------------------------------------ utilidades
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const d2 = (iso) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const fmt = (v, c) => v.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
export const n0 = (v) => (v == null ? "—" : fmt(Math.round(v), 0));
export const n1 = (v) => (v == null ? "—" : fmt(v, 1));
export const n2 = (v) => (v == null ? "—" : fmt(v, 2));
export const n3 = (v) => (v == null ? "—" : fmt(v, 3));
/** Dinheiro: R$ 1.234,56 */
export const rs = (v, c = 2) => (v == null ? "—" : "R$ " + fmt(v, c));
export const fmtGmd = (g) => (g == null ? "—" : n3(g));
export const gmdCls = (g) => (g == null ? "" : g >= 0.5 ? "gmd-up" : "gmd-low");
export const sinal = (v, f = n1) => (v == null ? "—" : (v >= 0 ? "+" : "−") + f(Math.abs(v)));
export const num = (v) => { const x = parseFloat(String(v ?? "").replace(/\./g, (m, i, s) => (s.includes(",") ? "" : m)).replace(",", ".")); return Number.isFinite(x) ? x : null; };
export const mesBr = (chave) => { const [a, m] = chave.split("-"); return `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][+m - 1]}/${a}`; };
export const icon = (id) => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
export const sexoPill = (s) => (s === "M" ? '<span class="pill m">Macho</span>' : '<span class="pill f">Fêmea</span>');
export const tagLote = (l) => `<span class="lote${l && l.ativo ? "" : " off"}">${esc(l ? l.numero : "excluído")}</span>`;
export const hoje = hojeISO;

export const fazendaAtual = () => (S.fazendas || []).find((f) => f.id === S.fazendaId) || null;
export const nomeFazenda = () => fazendaAtual()?.nome || "Fazenda";
const ordNum = (a, b) => String(a.numero ?? a.nome).localeCompare(String(b.numero ?? b.nome), "pt-BR", { numeric: true });
export const ativos = () => S.db.lotes.filter((l) => l.ativo).sort(ordNum);
export const lotePorId = (id) => S.db.lotes.find((l) => l.id === id);
export const nomeLote = (id) => lotePorId(id)?.numero ?? "(lote excluído)";
export const porId = (col, id) => S.db[col].find((x) => x.id === id) || null;
export const nomeDe = (col, id, vazio = "—") => porId(col, id)?.nome ?? vazio;
export const ordenados = (col) => [...S.db[col]].sort(ordNum);

export const opcoesLotes = (lista, sel) =>
  lista.length
    ? lista.map((l) => `<option value="${l.id}" ${l.id === sel ? "selected" : ""}>${esc(l.numero)} · ${l.quantidade} cab.</option>`).join("")
    : '<option value="">Nenhum lote ativo</option>';
export const opcoes = (col, sel, vazio) =>
  (vazio != null ? `<option value="">${esc(vazio)}</option>` : "") +
  ordenados(col).map((x) => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${esc(x.nome)}</option>`).join("");

export function toast(msg) {
  $$(".toast").forEach((t) => t.remove());
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 3800);
}
export const msgSalvo = () => (S.modo === "demo" ? "Salvo neste aparelho." : S.online ? "Salvo na nuvem." : "Salvo no aparelho. Sobe para a nuvem quando a internet voltar.");

/** Erros de formulário mostrados no próprio campo. Devolve true quando não há erro. */
export function erros(form, lista) {
  $$(".f.err", form).forEach((f) => f.classList.remove("err"));
  $$(".errmsg", form).forEach((e) => e.remove());
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

// ------------------------------------------------------------ campos de formulário
/** o: { tipo, v (valor), ph, hint, full, passo, modo } */
export function campo(id, label, o = {}) {
  const tipo = o.tipo || "text";
  const extra = tipo === "number" ? ` inputmode="${o.modo || "decimal"}" step="${o.passo || "any"}" min="0"` : "";
  return `<div class="f${o.full ? " full" : ""}"><label for="${id}">${label}</label><input id="${id}" type="${tipo}"${extra} autocomplete="off" value="${esc(o.v ?? "")}" placeholder="${esc(o.ph ?? "")}">${o.hint ? `<span class="hint">${o.hint}</span>` : ""}</div>`;
}
export const campoData = (id, label, v) => campo(id, label, { tipo: "date", v: v ?? hojeISO() });
export function sel(id, label, opcoesHtml, o = {}) {
  return `<div class="f${o.full ? " full" : ""}"><label for="${id}">${label}</label><select id="${id}">${opcoesHtml}</select>${o.hint ? `<span class="hint">${o.hint}</span>` : ""}</div>`;
}
export function seg(nome, label, ops, valor) {
  return `<div class="f"><span class="lb">${label}</span><div class="seg">${ops.map(([v, l]) => `<input type="radio" name="${nome}" id="${nome}-${v}" value="${v}" ${v === valor ? "checked" : ""}><label for="${nome}-${v}">${l}</label>`).join("")}</div></div>`;
}
export const val = (id) => ($("#" + id)?.value ?? "").trim();
export const marcado = (nome) => $(`input[name=${nome}]:checked`)?.value;

/** Botão que pede confirmação: o 1º toque troca o texto, o 2º executa. */
export function confirmar(btn, acao) {
  if (!btn) return;
  btn.onclick = () => {
    if (btn.dataset.armado) { acao(); return; }
    btn.dataset.armado = "1";
    btn.dataset.txt = btn.textContent;
    btn.textContent = btn.dataset.confirm || "Confirmar";
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armado; btn.textContent = btn.dataset.txt; } }, 4000);
  };
}

/** Histórico de preços com vigência, do mais novo para o mais antigo. */
export function histPrecos(precos, fmtItem) {
  const ord = [...(precos || [])].sort((a, b) => b.desde.localeCompare(a.desde));
  const h = hojeISO();
  const atual = ord.find((p) => p.desde <= h) || ord[ord.length - 1];
  return `<div class="hist">${ord.map((p) => `<span class="${p === atual ? "on" : ""}">${p.desde > h ? "a partir de" : "desde"} ${d2(p.desde)}: ${fmtItem(p)}</span>`).join("")}</div>`;
}
/** Junta um preço novo ao histórico. Se já existe um na mesma data, troca. */
export const comPreco = (precos, novo) => [...(precos || []).filter((p) => p.desde !== novo.desde), novo].sort((a, b) => a.desde.localeCompare(b.desde));

// ------------------------------------------------------------ registro de telas
export const TELAS = {};
export const MODS = [
  { k: "painel", s: "Painel", l: "Painel" },
  { k: "lotes", s: "Lotes", l: "Lotes", abas: [["ativos", "Lotes ativos"], ["entrada", "Entrada de lote"]] },
  { k: "pasto", s: "Pasto", l: "Manejo de pasto", abas: [["disposicao", "Disposição"], ["mudanca", "Mudança de pasto"], ["cadastro", "Cadastro de pastos"]] },
  { k: "pesagem", s: "Pesagem", l: "Pesagem e apartação", abas: [["pesagem", "Pesagem"], ["gmd", "Ajuste de GMD"], ["apartacao", "Apartação"]] },
  { k: "sanidade", s: "Sanidade", l: "Sanidade", abas: [["protocolo", "Protocolo"], ["tratamento", "Tratamento"], ["medicamentos", "Medicamentos"]] },
  { k: "trato", s: "Trato", l: "Trato", abas: [["dia", "Trato do dia"], ["troca", "Troca de dieta"], ["dietas", "Dietas"], ["ingredientes", "Ingredientes"]] },
  { k: "custos", s: "Custos", l: "Custos fixos e gerais", abas: [["fixos", "Custos fixos"], ["gerais", "Custos gerais"]] },
  { k: "saida", s: "Saída", l: "Saída", abas: [["saida", "Saída de lote"], ["historico", "Histórico"]] },
];
export const ir = (r) => { location.hash = r; };
/** Ganchos que a casca preenche (evita importação em círculo). */
export const ui = { refazerLista() {} };
