// Trato: exigência do dia por lote, troca de dieta, dietas (com versões) e catálogo de ingredientes.
import {
  store, S, M, $, $$, esc, d2, n0, n1, n2, rs, num, tagLote, toast, msgSalvo, erros, ativos, lotePorId, nomeDe, ordenados, porId,
  opcoesLotes, opcoes, campo, campoData, sel, val, confirmar, histPrecos, comPreco, TELAS, hoje,
} from "./base.js";
import { dietaEm, vigente } from "./calc.js";
import { opcoesDieta } from "./telas-lotes.js";

const opcoesIng = (v) => opcoes("ingredientes", v, S.db.ingredientes.length ? "Escolha o ingrediente" : "Nenhum ingrediente cadastrado");
const rKgIng = (ing, data) => { const p = ing && vigente(ing.precos, data); return p ? p.valor / 1000 : 0; };

// ------------------------------------------------------------ trato do dia
TELAS["trato/dia"] = {
  lista() {
    const m = M(), h = hoje();
    if (!S.db.dietas.length) return `<section class="card"><h3>Nenhuma dieta cadastrada</h3><p class="note" style="margin:8px 0 14px">Cadastre os ingredientes com o preço por tonelada, monte a dieta e escolha a dieta de cada lote. O sistema calcula quanto cada lote precisa por dia e quanto custa.</p>
      <div class="actions"><button class="btn" type="button" data-act="ir" data-to="trato/ingredientes">Cadastrar ingredientes</button><button class="btn ghost" type="button" data-act="ir" data-to="trato/dietas">Montar dieta</button></div></section>`;
    const com = m.ativos.filter((r) => r.consumo), sem = m.ativos.filter((r) => !r.consumo);
    const tot = new Map();
    let kg = 0, custo = 0;
    const cards = com.map((r) => {
      const dt = dietaEm(S.db, porId("dietas", r.dietaId), h);
      kg += r.consumo.kgLote; custo += r.hoje.trato;
      const linhas = dt.itens.map((it) => {
        const q = (r.consumo.kgLote * it.pct) / 100, c = q * it.rKg;
        const t = tot.get(it.ingId) || { nome: it.nome, kg: 0, custo: 0 };
        t.kg += q; t.custo += c; tot.set(it.ingId, t);
        return `<tr><td>${esc(it.nome)} <span class="note">${n1(it.pct)}%</span></td><td class="r"><b>${n1(q)} kg</b></td><td class="r">${rs(c)}</td></tr>`;
      }).join("");
      return `<section class="card pcard">
        <div><span class="kicker">Dieta ${esc(nomeDe("dietas", r.dietaId))}</span>
          <h3><button type="button" data-act="lote" data-id="${r.lote.id}" style="border:0;background:none;padding:0;cursor:pointer" aria-label="Abrir lote ${esc(r.lote.numero)}">${tagLote(r.lote)}</button></h3></div>
        <div class="nums">
          <div><span class="label">No cocho</span><b>${n0(r.consumo.kgLote)} kg</b></div>
          <div><span class="label">Por cabeça</span><b>${n2(r.consumo.kgCab)} kg</b></div>
          <div><span class="label">Custo hoje</span><b>${rs(r.hoje.trato, 0)}</b></div>
        </div>
        <p class="note">${r.lote.quantidade} cabeças × ${n0(r.peso)} kg estimados × ${n2(r.consumo.pv)}% do peso vivo = ${n0(r.consumo.kgLote)} kg por dia · ${rs(r.consumo.custoKg, 3)} por kg da dieta</p>
        <div class="tw"><table class="compacta"><thead><tr><th>Ingrediente</th><th class="r">Quanto vai</th><th class="r">Custo</th></tr></thead><tbody>${linhas}</tbody></table></div>
      </section>`;
    }).join("");
    const resumo = com.length ? `<section class="card"><div class="sec-h"><h3>Trato de hoje, ${d2(h)}</h3><span class="note">${com.length} ${com.length === 1 ? "lote" : "lotes"} no cocho</span></div>
      <div class="calc"><div><span class="label">Total no cocho</span><b>${n0(kg)} kg</b></div><div><span class="label">Custo por kg médio</span><b>${rs(kg ? custo / kg : 0, 3)}</b></div>
      <div class="res" style="grid-column:span 2"><span class="label">Custo de trato do dia</span><b>${rs(custo)}</b><span class="note">soma de todos os lotes</span></div></div>
      <div class="tw" style="margin-top:12px"><table class="compacta"><thead><tr><th>Ingrediente</th><th class="r">Total do dia</th><th class="r">Custo</th></tr></thead><tbody>
      ${[...tot.values()].sort((a, b) => b.kg - a.kg).map((t) => `<tr><td>${esc(t.nome)}</td><td class="r"><b>${n1(t.kg)} kg</b></td><td class="r">${rs(t.custo)}</td></tr>`).join("")}</tbody></table></div></section>`
      : `<section class="card"><p class="empty">Nenhum lote ativo está com dieta. Escolha a dieta na entrada do lote ou em Troca de dieta.</p></section>`;
    return `${resumo}<div class="grid3" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr))">${cards}</div>
      ${sem.length ? `<p class="note">Só no pasto, sem trato: ${sem.map((r) => esc(r.lote.numero)).join(", ")}.</p>` : ""}
      <div class="actions"><button class="btn" type="button" data-act="ir" data-to="trato/troca">Trocar a dieta de um lote</button></div>`;
  },
};

// ------------------------------------------------------------ troca de dieta
const tratoAtual = (loteId) => S.db.tratos.filter((t) => t.loteId === loteId && t.data <= hoje()).sort((a, b) => a.data.localeCompare(b.data)).pop() || null;

TELAS["trato/troca"] = {
  form: () => `
    <form class="card" id="fTr" novalidate>
      <div class="fgrid">
        ${sel("tr-lote", "Lote", opcoesLotes(ativos()))}
        ${campoData("tr-data", "Data da troca")}
        ${sel("tr-dieta", "Nova dieta", opcoesDieta(), { full: true })}
      </div>
      <p class="note" id="tr-info"></p>
      <div class="actions"><button class="btn" type="submit">Registrar troca</button><span class="note">O dia da troca já conta na dieta nova.</span></div>
    </form>`,
  info() {
    const l = lotePorId(val("tr-lote")), t = l && tratoAtual(l.id);
    $("#tr-info").textContent = l ? `${l.numero} está ${t && t.dietaId ? "na dieta " + nomeDe("dietas", t.dietaId, "(excluída)") + " desde " + d2(t.data) : "sem trato, só no pasto"}.` : "";
  },
  atualizarForm() {
    const a = $("#tr-lote"), b = $("#tr-dieta");
    a.innerHTML = opcoesLotes(ativos(), a.value); b.innerHTML = opcoesDieta(b.value);
    this.info();
  },
  ligar() {
    $("#tr-lote").onchange = () => this.info();
    this.info();
    $("#fTr").onsubmit = (ev) => {
      ev.preventDefault();
      const f = ev.target, l = lotePorId(val("tr-lote")), data = val("tr-data"), dietaId = val("tr-dieta") || null;
      const atual = l && tratoAtual(l.id);
      const e = [];
      if (!l) e.push(["tr-lote", "Escolha o lote."]);
      if (!data) e.push(["tr-data", "Informe a data."]);
      else if (data > hoje()) e.push(["tr-data", "A data não pode ser no futuro."]);
      else if (l && data <= l.dataEntrada) e.push(["tr-data", `O lote entrou em ${d2(l.dataEntrada)}. A troca precisa ser depois. Para corrigir a dieta da entrada, abra o lote.`]);
      if (l && atual && (atual.dietaId || null) === dietaId && data >= atual.data) e.push(["tr-dieta", "O lote já está nesta dieta."]);
      if (!erros(f, e)) return;
      const mesmoDia = S.db.tratos.find((x) => x.loteId === l.id && x.data === data && !x.inicial);
      const dados = { loteId: l.id, data, dietaId };
      store.gravar([mesmoDia ? { tipo: "update", col: "tratos", id: mesmoDia.id, dados } : { tipo: "set", col: "tratos", id: store.novoId(), dados }]);
      toast(`${l.numero}: ${dietaId ? "dieta " + nomeDe("dietas", dietaId) : "sem trato"} a partir de ${d2(data)}. ${msgSalvo()}`);
    };
  },
  lista() {
    const tr = S.db.tratos.filter((x) => !x.inicial || x.dietaId).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 60);
    return `<section class="card"><div class="sec-h"><h3>Histórico de dietas</h3><span class="note">entradas e trocas</span></div>
    ${tr.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Lote</th><th>Dieta</th><th>Tipo</th></tr></thead><tbody>
    ${tr.map((x) => `<tr class="click" data-act="lote" data-id="${x.loteId}"><td>${d2(x.data)}</td><td>${tagLote(lotePorId(x.loteId))}</td><td>${x.dietaId ? esc(nomeDe("dietas", x.dietaId, "(excluída)")) : "Sem trato (só pasto)"}</td><td>${x.inicial ? "Entrada" : "Troca"}</td></tr>`).join("")}
    </tbody></table></div><p class="note" style="margin-top:10px">Para apagar uma troca, abra o lote e use Excluir no histórico.</p>` : '<p class="empty">Nenhum lote com dieta ainda.</p>'}</section>`;
  },
};

// ------------------------------------------------------------ dietas
const linhaItem = (pfx, i, it = {}) => `<div class="rowf" data-item="${i}">${sel(`${pfx}-ing-${i}`, "Ingrediente", opcoesIng(it.ingId))}${campo(`${pfx}-pct-${i}`, "% na mistura", { tipo: "number", v: it.pct, ph: "0" })}</div>`;
function blocoItens(pfx, itens = []) {
  const n = Math.max(3, itens.length);
  return `<div class="rows" id="${pfx}-itens" data-n="${n}">${Array.from({ length: n }, (_, i) => linhaItem(pfx, i, itens[i])).join("")}</div>
    <div class="actions" style="margin-top:8px"><button class="btn ghost sm" type="button" data-mais-item="${pfx}">Adicionar ingrediente</button></div>
    <div class="calc" id="${pfx}-res" aria-live="polite"></div>`;
}
function lerItens(pfx) {
  const n = +($(`#${pfx}-itens`)?.dataset.n || 0), itens = [], e = [];
  for (let i = 0; i < n; i++) {
    const ingId = val(`${pfx}-ing-${i}`), pct = num(val(`${pfx}-pct-${i}`));
    if (!ingId && !pct) continue;
    if (!ingId) e.push([`${pfx}-ing-${i}`, "Escolha o ingrediente."]);
    else if (itens.some((x) => x.ingId === ingId)) e.push([`${pfx}-ing-${i}`, "Ingrediente repetido."]);
    if (!pct || pct <= 0) e.push([`${pfx}-pct-${i}`, "Informe a %."]);
    if (ingId && pct > 0) itens.push({ ingId, pct });
  }
  const soma = itens.reduce((s, x) => s + x.pct, 0);
  return { itens, soma, e, ok100: Math.abs(soma - 100) < 0.01 };
}
function resumoItens(pfx, data, pv) {
  const box = $(`#${pfx}-res`);
  if (!box) return;
  const { itens, soma, ok100 } = lerItens(pfx);
  if (!itens.length) { box.innerHTML = '<span class="formula">Escolha os ingredientes e a % de cada um. A soma tem que dar 100%.</span>'; return; }
  let custoKg = 0, ms = 0;
  for (const it of itens) { const ing = porId("ingredientes", it.ingId); custoKg += (it.pct / 100) * rKgIng(ing, data); ms += (it.pct / 100) * (ing?.ms || 0); }
  box.innerHTML = `
    <div><span class="label">Soma das %</span><b class="${ok100 ? "pos" : "neg"}">${n1(soma)}%</b><span class="note">${ok100 ? "fechou 100%" : soma < 100 ? "faltam " + n1(100 - soma) + "%" : "passou " + n1(soma - 100) + "%"}</span></div>
    <div><span class="label">Matéria seca</span><b>${n1(ms)}%</b></div>
    <div class="res"><span class="label">Custo por kg</span><b>${rs(custoKg, 3)}</b><span class="note">${rs(custoKg * 1000, 0)} por tonelada</span></div>
    <div><span class="label">Boi de 300 kg</span><b>${pv ? rs(3 * pv * custoKg) : "—"}</b><span class="note">${pv ? n1(3 * pv) + " kg por dia" : "informe a % do peso vivo"}</span></div>
    <span class="formula">Custo por kg = soma de (% do ingrediente × R$/kg do ingrediente), com o preço de ${d2(data)}.</span>`;
}
function ligarItens(form, pfx, dataDe, pvDe) {
  const atualiza = () => resumoItens(pfx, dataDe(), pvDe());
  form.addEventListener("input", atualiza);
  form.addEventListener("change", atualiza);
  const mais = form.querySelector(`[data-mais-item="${pfx}"]`);
  if (mais) mais.onclick = () => {
    const box = $(`#${pfx}-itens`), i = +box.dataset.n;
    box.insertAdjacentHTML("beforeend", linhaItem(pfx, i));
    box.dataset.n = i + 1;
  };
  atualiza();
}

TELAS["trato/dietas"] = {
  form: () => `${S.db.ingredientes.length ? "" : `<div class="banner"><span><b>Cadastre os ingredientes primeiro.</b> A dieta é montada com eles.</span><button class="btn sm" type="button" data-act="ir" data-to="trato/ingredientes">Cadastrar ingredientes</button></div>`}
    <form class="card" id="fDieta" novalidate>
      <h3>Nova dieta</h3>
      <div class="fgrid">
        ${campo("di-nome", "Nome da dieta", { ph: "Ex.: Recria 1%" })}
        ${campo("di-pv", "Consumo esperado (% do peso vivo por dia)", { tipo: "number", ph: "1", hint: "Ex.: 1 para 1% do peso vivo" })}
      </div>
      ${blocoItens("di")}
      <div class="actions"><button class="btn" type="submit">Cadastrar dieta</button><span class="note">As % são do jeito que vai no cocho (matéria natural).</span></div>
    </form>`,
  ligar() {
    const f = $("#fDieta");
    ligarItens(f, "di", hoje, () => num(val("di-pv")));
    f.onsubmit = (ev) => {
      ev.preventDefault();
      const nome = val("di-nome"), pv = num(val("di-pv")), r = lerItens("di");
      const e = [...r.e];
      if (!nome) e.push(["di-nome", "Informe o nome."]);
      else if (S.db.dietas.some((d) => d.nome.toLowerCase() === nome.toLowerCase())) e.push(["di-nome", "Já existe uma dieta com esse nome."]);
      if (!pv || pv <= 0 || pv > 10) e.push(["di-pv", "Informe a % do peso vivo (entre 0,1 e 10)."]);
      if (!r.itens.length) e.push(["di-ing-0", "Escolha pelo menos um ingrediente."]);
      else if (!r.e.length && !r.ok100) e.push(["di-pct-0", `A soma das % está em ${n1(r.soma)}%. Tem que dar 100%.`]);
      if (!erros(f, e)) return;
      store.gravar([{ tipo: "set", col: "dietas", id: store.novoId(), dados: { nome, versoes: [{ desde: hoje(), pv, itens: r.itens }] } }]);
      toast(`Dieta ${nome} cadastrada. ${msgSalvo()}`);
      f.reset();
      resumoItens("di", hoje(), null);
    };
  },
  lista() {
    const ds = ordenados("dietas"), h = hoje();
    if (!ds.length) return '<section class="card"><p class="empty">Nenhuma dieta cadastrada ainda.</p></section>';
    return `<section class="card"><div class="sec-h"><h3>Dietas cadastradas</h3><span class="note">${ds.length}</span></div>
    <div class="rows">${ds.map((d) => {
      const v = dietaEm(S.db, d, h), bruta = vigente(d.versoes, h);
      const usando = M().ativos.filter((r) => r.dietaId === d.id);
      return `<div class="item"><div class="ih"><div><b>${esc(d.nome)}</b><div class="note">${n2(v.pv)}% do peso vivo · ${n1(v.ms)}% de matéria seca${usando.length ? " · em uso: " + usando.map((r) => esc(r.lote.numero)).join(", ") : ""}</div></div>
        <div style="text-align:right"><span class="mono">${rs(v.custoKg, 3)}/kg</span><div class="note">${rs(v.custoKg * 1000, 0)} por tonelada</div></div></div>
        <div class="tw"><table><thead><tr><th>Ingrediente</th><th class="r">%</th><th class="r">R$/t hoje</th><th class="r">Pesa no kg</th></tr></thead><tbody>
        ${v.itens.map((it) => `<tr><td>${esc(it.nome)}</td><td class="r">${n1(it.pct)}%</td><td class="r">${rs(it.rT, 0)}</td><td class="r">${rs(it.parte, 3)}</td></tr>`).join("")}</tbody></table></div>
        ${histPrecos(d.versoes, (x) => `${n2(x.pv)}% PV · ${(x.itens || []).length} ingredientes`)}
        <details class="mais"><summary>Mudar a composição ou corrigir o nome</summary>
          <form data-versao="${d.id}" novalidate style="display:flex;flex-direction:column;gap:12px">
            <div class="fgrid">${campoData("dv" + d.id + "-d", "Nova composição vale a partir de")}${campo("dv" + d.id + "-pv", "% do peso vivo por dia", { tipo: "number", v: bruta.pv })}</div>
            ${blocoItens("dv" + d.id, bruta.itens)}
            <p class="note">A composição nova vale só da data informada em diante. O custo dos dias anteriores não muda.</p>
            <div class="actions"><button class="btn ghost sm" type="submit">Salvar nova composição</button></div></form>
          <form class="rowf" data-edit="${d.id}" novalidate style="margin-top:12px">
            ${campo("de-n-" + d.id, "Nome", { v: d.nome })}
            <button class="btn ghost sm" type="submit">Salvar nome</button>
            <button class="mini danger" type="button" data-excluir="${d.id}" data-confirm="Confirmar exclusão">Excluir dieta</button></form>
        </details></div>`;
    }).join("")}</div></section>`;
  },
  ligarLista() {
    $$("form[data-versao]").forEach((f) => {
      const id = f.dataset.versao, pfx = "dv" + id;
      ligarItens(f, pfx, () => val(pfx + "-d") || hoje(), () => num(val(pfx + "-pv")));
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const d = porId("dietas", id), data = val(pfx + "-d"), pv = num(val(pfx + "-pv")), r = lerItens(pfx);
        const e = [...r.e];
        if (!data) e.push([pfx + "-d", "Informe a data."]);
        if (!pv || pv <= 0 || pv > 10) e.push([pfx + "-pv", "Informe a % do peso vivo."]);
        if (!r.itens.length) e.push([pfx + "-ing-0", "Escolha pelo menos um ingrediente."]);
        else if (!r.e.length && !r.ok100) e.push([pfx + "-pct-0", `A soma das % está em ${n1(r.soma)}%. Tem que dar 100%.`]);
        if (!erros(f, e)) return;
        store.gravar([{ tipo: "update", col: "dietas", id, dados: { versoes: comPreco(d.versoes, { desde: data, pv, itens: r.itens }) } }]);
        toast(`Dieta ${d.nome}: nova composição a partir de ${d2(data)}.`);
      };
    });
    $$("form[data-edit]").forEach((f) => {
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const id = f.dataset.edit, nome = val("de-n-" + id);
        if (!erros(f, nome ? [] : [["de-n-" + id, "Informe o nome."]])) return;
        store.gravar([{ tipo: "update", col: "dietas", id, dados: { nome } }]);
        toast("Nome atualizado.");
      };
    });
    $$("[data-excluir]").forEach((b) => confirmar(b, () => {
      const id = b.dataset.excluir;
      if (S.db.tratos.some((t) => t.dietaId === id)) { toast("Esta dieta já foi usada por lotes e não pode ser excluída. O histórico de custos depende dela."); return; }
      store.gravar([{ tipo: "delete", col: "dietas", id }]);
      toast("Dieta excluída.");
    }));
  },
};

// ------------------------------------------------------------ ingredientes
TELAS["trato/ingredientes"] = {
  form: () => `
    <form class="card" id="fIng" novalidate>
      <h3>Novo ingrediente</h3>
      <div class="fgrid c3">
        ${campo("in-nome", "Nome do ingrediente", { ph: "Ex.: Milho moído" })}
        ${campo("in-ms", "Matéria seca (%)", { tipo: "number", ph: "88" })}
        ${campo("in-preco", "Custo por tonelada (R$/t)", { tipo: "number", ph: "1100", hint: "Já posto na fazenda, com frete" })}
      </div>
      <p class="note" id="in-conta"></p>
      <div class="actions"><button class="btn" type="submit">Cadastrar ingrediente</button></div>
    </form>`,
  ligar() {
    const conta = () => { const p = num(val("in-preco")); $("#in-conta").textContent = p != null ? `Custo por kg: ${rs(p)} ÷ 1.000 = ${rs(p / 1000, 3)} por kg.` : ""; };
    $("#fIng").oninput = conta;
    $("#fIng").onsubmit = (ev) => {
      ev.preventDefault();
      const f = ev.target, nome = val("in-nome"), ms = num(val("in-ms")), preco = num(val("in-preco"));
      const e = [];
      if (!nome) e.push(["in-nome", "Informe o nome."]);
      else if (S.db.ingredientes.some((i) => i.nome.toLowerCase() === nome.toLowerCase())) e.push(["in-nome", "Já existe um ingrediente com esse nome."]);
      if (ms == null || ms <= 0 || ms > 100) e.push(["in-ms", "Informe a % de matéria seca (até 100)."]);
      if (preco == null || preco < 0) e.push(["in-preco", "Informe o custo por tonelada."]);
      if (!erros(f, e)) return;
      store.gravar([{ tipo: "set", col: "ingredientes", id: store.novoId(), dados: { nome, ms, precos: [{ desde: hoje(), valor: preco }] } }]);
      toast(`${nome} cadastrado. ${msgSalvo()}`);
      f.reset(); conta();
    };
  },
  lista() {
    const is = ordenados("ingredientes"), h = hoje();
    if (!is.length) return '<section class="card"><p class="empty">Nenhum ingrediente cadastrado ainda.</p></section>';
    return `<section class="card"><div class="sec-h"><h3>Ingredientes cadastrados</h3><span class="note">${is.length}</span></div>
    <div class="rows">${is.map((i) => {
      const v = vigente(i.precos, h);
      return `<div class="item"><div class="ih"><div><b>${esc(i.nome)}</b><div class="note">${n1(i.ms)}% de matéria seca</div></div>
        <div style="text-align:right"><span class="mono">${rs(v ? v.valor : 0, 0)}/t</span><div class="note">${rs(rKgIng(i, h), 3)} por kg</div></div></div>
        ${histPrecos(i.precos, (x) => rs(x.valor, 0) + "/t")}
        <details class="mais"><summary>Lançar preço novo ou corrigir o cadastro</summary>
          <form class="rowf" data-preco="${i.id}" novalidate>
            ${campo("ip-v-" + i.id, "Novo custo (R$/t)", { tipo: "number" })}${campoData("ip-d-" + i.id, "Vale a partir de")}
            <button class="btn ghost sm" type="submit">Salvar preço novo</button></form>
          <p class="note" style="margin:8px 0">O preço novo vale só da data informada em diante. O trato dos dias anteriores continua com o preço antigo.</p>
          <form class="rowf" data-edit="${i.id}" novalidate>
            ${campo("ie-n-" + i.id, "Nome", { v: i.nome })}${campo("ie-m-" + i.id, "Matéria seca (%)", { tipo: "number", v: i.ms })}
            <button class="btn ghost sm" type="submit">Salvar cadastro</button>
            <button class="mini danger" type="button" data-excluir="${i.id}" data-confirm="Confirmar exclusão">Excluir ingrediente</button></form>
        </details></div>`;
    }).join("")}</div></section>`;
  },
  ligarLista() {
    $$("form[data-preco]").forEach((f) => {
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const id = f.dataset.preco, i = porId("ingredientes", id), v = num(val("ip-v-" + id)), d = val("ip-d-" + id);
        const e = [];
        if (v == null || v < 0) e.push(["ip-v-" + id, "Informe o custo."]);
        if (!d) e.push(["ip-d-" + id, "Informe a data."]);
        if (!erros(f, e)) return;
        store.gravar([{ tipo: "update", col: "ingredientes", id, dados: { precos: comPreco(i.precos, { desde: d, valor: v }) } }]);
        toast(`${i.nome}: ${rs(v, 0)}/t a partir de ${d2(d)}.`);
      };
    });
    $$("form[data-edit]").forEach((f) => {
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const id = f.dataset.edit, nome = val("ie-n-" + id), ms = num(val("ie-m-" + id));
        const e = [];
        if (!nome) e.push(["ie-n-" + id, "Informe o nome."]);
        if (ms == null || ms <= 0 || ms > 100) e.push(["ie-m-" + id, "Informe a % de matéria seca."]);
        if (!erros(f, e)) return;
        store.gravar([{ tipo: "update", col: "ingredientes", id, dados: { nome, ms } }]);
        toast("Cadastro do ingrediente atualizado.");
      };
    });
    $$("[data-excluir]").forEach((b) => confirmar(b, () => {
      const id = b.dataset.excluir;
      if (S.db.dietas.some((d) => (d.versoes || []).some((v) => (v.itens || []).some((it) => it.ingId === id)))) { toast("Este ingrediente está em uma dieta e não pode ser excluído."); return; }
      store.gravar([{ tipo: "delete", col: "ingredientes", id }]);
      toast("Ingrediente excluído.");
    }));
  },
};
