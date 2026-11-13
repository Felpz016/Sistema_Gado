// Saída: abate ou venda viva, com o fechamento do lote (custos, receita e resultado) e o histórico.
import {
  store, S, M, $, esc, d2, n0, n1, n3, rs, num, fmtGmd, tagLote, toast, msgSalvo, erros, ativos, lotePorId,
  opcoesLotes, campo, campoData, sel, seg, val, marcado, TELAS, hoje,
} from "./base.js";
import { modelo, fechamento, pesagensDoLote } from "./calc.js";
import { blocoCustos, blocoFechamento } from "./drawer.js";

function lerSaida() {
  const tipo = marcado("x-tipo") === "vivo" ? "vivo" : "abate";
  const rr = val("x-rreal");
  return {
    tipo, data: val("x-data"), destino: val("x-dest"), peso: num(val("x-peso")), obs: val("x-obs"),
    precoArroba: tipo === "abate" ? num(val("x-arroba")) : null,
    rendEsp: tipo === "abate" ? num(val("x-rend")) : null,
    rendReal: tipo === "abate" && rr !== "" ? num(rr) : null,
    precoKg: tipo === "vivo" ? num(val("x-kg")) : null,
  };
}

function mostrarTipo() {
  const abate = marcado("x-tipo") !== "vivo";
  for (const el of document.querySelectorAll("[data-so]")) el.hidden = (el.dataset.so === "abate") !== abate;
}

function calcSaida() {
  const box = $("#x-fech");
  if (!box) return;
  mostrarTipo();
  const l = lotePorId(val("x-lote")), s = lerSaida();
  if (!l) { box.innerHTML = '<p class="empty">Nenhum lote ativo para dar saída.</p>'; return; }
  if (!s.data || s.data <= l.dataEntrada || s.data > hoje()) { box.innerHTML = `<p class="note">Informe uma data de saída depois da entrada do lote (${d2(l.dataEntrada)}) e até hoje.</p>`; return; }
  const r = modelo(S.db, s.data).lote(l.id);
  s.quantidade = l.quantidade;
  const semPeso = !s.peso;
  if (semPeso) s.peso = null;
  box.innerHTML = `
    <div class="sec-h"><h3>Fechamento do lote ${esc(l.numero)}</h3><span class="note">${r.dias} dias na fazenda · peso estimado na data: ${n0(r.peso)} kg</span></div>
    ${blocoCustos(r.custos, r.total || 1)}
    <div style="height:12px"></div>
    ${blocoFechamento(r, s)}
    <p class="note" style="margin-top:10px">${semPeso ? "Informe o peso de saída e o preço para ver a receita e o resultado. " : ""}GMD estimado do lote: ${n3(r.gmdEst)} kg/dia. O custo conta até o dia anterior à saída.</p>`;
}

TELAS["saida/saida"] = {
  form: () => `
    <form class="card" id="fSai" novalidate>
      <div class="fgrid">
        ${sel("x-lote", "Lote", opcoesLotes(ativos()))}
        ${campoData("x-data", "Data da saída")}
        ${seg("x-tipo", "Tipo de saída", [["abate", "Abate"], ["vivo", "Venda viva"]], "abate")}
        ${campo("x-dest", "Destino", { ph: "Frigorífico, comprador, fazenda ou cidade" })}
        ${campo("x-peso", "Peso médio de saída (kg/cabeça)", { tipo: "number", ph: "540" })}
        ${campo("x-pesot", "ou peso total do lote (kg)", { tipo: "number", ph: "calcula a média" })}
        <div class="f" data-so="abate"><label for="x-arroba">Preço da arroba (R$/@)</label><input id="x-arroba" type="number" inputmode="decimal" step="any" min="0" autocomplete="off" placeholder="320"></div>
        <div class="f" data-so="abate"><label for="x-rend">Rendimento de carcaça esperado (%)</label><input id="x-rend" type="number" inputmode="decimal" step="any" min="0" autocomplete="off" value="52"></div>
        <div class="f" data-so="abate"><label for="x-rreal">Rendimento real (%)</label><input id="x-rreal" type="number" inputmode="decimal" step="any" min="0" autocomplete="off" placeholder="opcional, quando chegar o romaneio"><span class="hint">Pode lançar depois, no histórico</span></div>
        <div class="f" data-so="vivo" hidden><label for="x-kg">Preço do kg vivo (R$/kg)</label><input id="x-kg" type="number" inputmode="decimal" step="any" min="0" autocomplete="off" placeholder="11"></div>
        ${campo("x-obs", "Observações", { ph: "opcional", full: true })}
      </div>
      <section id="x-fech" aria-live="polite"></section>
      <div class="actions"><button class="btn earth" type="submit">Registrar saída do lote</button><span class="note">O lote inteiro sai dos ativos e o pasto fica livre.</span></div>
    </form>`,
  atualizarForm() {
    const el = $("#x-lote");
    el.innerHTML = opcoesLotes(ativos(), el.value);
    calcSaida();
  },
  ligar() {
    const f = $("#fSai");
    const sugerir = () => { const r = M().lote(val("x-lote")); $("#x-peso").placeholder = r ? `estimado: ${n0(r.peso)}` : "540"; };
    f.addEventListener("input", (e) => {
      const l = lotePorId(val("x-lote"));
      if (e.target.id === "x-pesot" && l) { const t = num(val("x-pesot")); if (t) $("#x-peso").value = Math.round((t / l.quantidade) * 10) / 10; }
      if (e.target.id === "x-peso") $("#x-pesot").value = "";
      calcSaida();
    });
    f.addEventListener("change", () => { sugerir(); calcSaida(); });
    sugerir(); calcSaida();
    f.onsubmit = (ev) => {
      ev.preventDefault();
      const l = lotePorId(val("x-lote")), s = lerSaida();
      const e = [];
      if (!l) e.push(["x-lote", "Escolha o lote."]);
      if (!s.data) e.push(["x-data", "Informe a data."]);
      else if (s.data > hoje()) e.push(["x-data", "A data não pode ser no futuro."]);
      else if (l && s.data <= l.dataEntrada) e.push(["x-data", `O lote entrou em ${d2(l.dataEntrada)}. A saída precisa ser depois.`]);
      else if (l && pesagensDoLote(S.db, l.id).some((p) => p.data > s.data)) e.push(["x-data", "Existe pesagem deste lote depois dessa data."]);
      if (!s.peso || s.peso <= 0) e.push(["x-peso", "Informe o peso de saída."]);
      if (s.tipo === "abate") {
        if (!s.precoArroba || s.precoArroba <= 0) e.push(["x-arroba", "Informe o preço da arroba."]);
        if (!s.rendEsp || s.rendEsp <= 0 || s.rendEsp > 100) e.push(["x-rend", "Informe o rendimento esperado (ex.: 52)."]);
        if (s.rendReal != null && (s.rendReal <= 0 || s.rendReal > 100)) e.push(["x-rreal", "Informe um percentual entre 1 e 100."]);
      } else if (!s.precoKg || s.precoKg <= 0) e.push(["x-kg", "Informe o preço do kg vivo."]);
      if (!erros(f, e)) return;
      const dados = { ...s, loteId: l.id, quantidade: l.quantidade };
      const r = modelo(S.db, s.data).lote(l.id), fe = fechamento(r, dados);
      store.gravar([{ tipo: "set", col: "saidas", id: store.novoId(), dados }, { tipo: "update", col: "lotes", id: l.id, dados: { ativo: false } }]);
      toast(`Saída do ${l.numero} registrada. Resultado: ${rs(fe.resultado, 0)}. ${msgSalvo()}`);
      for (const id of ["x-dest", "x-peso", "x-pesot", "x-arroba", "x-rreal", "x-kg", "x-obs"]) $("#" + id).value = "";
      sugerir(); calcSaida();
    };
  },
};

// ------------------------------------------------------------ histórico de saídas
TELAS["saida/historico"] = {
  lista() {
    const m = M();
    const linhas = [...S.db.saidas].sort((a, b) => b.data.localeCompare(a.data)).map((s) => {
      const r = m.lote(s.loteId);
      return { s, r, f: r && s.tipo ? fechamento(r, s) : null };
    });
    if (!linhas.length) return `<section class="card"><h3>Nenhuma saída registrada</h3><p class="note" style="margin:8px 0 14px">Quando um lote sair para abate ou venda, o fechamento dele fica guardado aqui.</p><div class="actions"><button class="btn" type="button" data-act="ir" data-to="saida/saida">Registrar saída</button></div></section>`;
    const com = linhas.filter((x) => x.f && x.f.resultado != null);
    const receita = com.reduce((t, x) => t + x.f.receita, 0), custo = com.reduce((t, x) => t + x.f.custoTotal, 0), cab = com.reduce((t, x) => t + (x.s.quantidade || x.r.lote.quantidade), 0);
    const tipo = (s) => (s.tipo === "abate" ? "Abate" : s.tipo === "vivo" ? "Venda viva" : s.motivo || "Saída");
    const semReal = linhas.filter((x) => x.s.tipo === "abate" && (x.s.rendReal == null || x.s.rendReal === ""));
    return `
    ${com.length ? `<section class="kpis">
      <div class="card kpi dark"><span class="label">Resultado das saídas</span><span class="v">${rs(receita - custo, 0)}</span><span class="s">${cab ? rs((receita - custo) / cab) + " por cabeça" : ""}</span></div>
      <div class="card kpi"><span class="label">Receita</span><span class="v">${rs(receita, 0)}</span><span class="s">${com.length} ${com.length === 1 ? "lote" : "lotes"} · ${n0(cab)} cabeças</span></div>
      <div class="card kpi"><span class="label">Custo total</span><span class="v">${rs(custo, 0)}</span><span class="s">compra, pasto, trato, sanidade e rateios</span></div>
      <div class="card kpi"><span class="label">Margem</span><span class="v">${receita ? n1(((receita - custo) / receita) * 100) : "—"}<small>%</small></span><span class="s">resultado ÷ receita</span></div>
    </section>` : ""}
    ${semReal.length ? `<div class="banner"><span><b>Falta o rendimento real de ${semReal.length === 1 ? "1 abate" : semReal.length + " abates"}:</b> ${semReal.map((x) => esc(x.r ? x.r.lote.numero : "?")).join(", ")}. Enquanto não lançar, vale o rendimento esperado.</span></div>` : ""}
    <section class="card"><div class="sec-h"><h3>Histórico de saídas</h3><span class="note">toque na linha para ver o fechamento e lançar o rendimento real</span></div>
    <div class="tw"><table><thead><tr><th>Data</th><th>Lote</th><th>Tipo</th><th>Destino</th><th class="r">Cab.</th><th class="r">Peso</th><th class="r">Dias</th><th class="r">GMD</th><th class="r">Receita</th><th class="r">Custo</th><th class="r">Resultado</th></tr></thead><tbody>
    ${linhas.map(({ s, r, f }) => `<tr class="click" data-act="lote" data-id="${s.loteId}"><td>${d2(s.data)}</td><td>${tagLote(r ? r.lote : null)}</td><td>${esc(tipo(s))}</td><td>${esc(s.destino || "—")}</td>
      <td class="r">${s.quantidade || (r ? r.lote.quantidade : "—")}</td><td class="r">${s.peso ? n0(s.peso) + " kg" : "—"}</td><td class="r">${r ? r.dias : "—"}</td><td class="r">${f ? fmtGmd(f.gmdPeriodo) : "—"}</td>
      <td class="r">${f ? rs(f.receita, 0) : "—"}</td><td class="r">${r ? rs(r.total, 0) : "—"}</td><td class="r"><b class="${!f || f.resultado == null ? "" : f.resultado >= 0 ? "pos" : "neg"}">${f ? rs(f.resultado, 0) : "—"}</b></td></tr>`).join("")}
    </tbody></table></div></section>`;
  },
};
