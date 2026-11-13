// Manejo de pasto: disposição dos lotes, mudança de pasto e cadastro de pastos.
import {
  store, S, M, $, $$, esc, d2, n0, n1, n2, rs, num, tagLote, toast, msgSalvo, erros, ativos, lotePorId, nomeDe, ordenados,
  opcoesLotes, campo, campoData, sel, val, confirmar, histPrecos, comPreco, TELAS, hoje,
} from "./base.js";
import { dias, vigente } from "./calc.js";
import { opcoesPasto } from "./telas-lotes.js";

// ------------------------------------------------------------ disposição
TELAS["pasto/disposicao"] = {
  lista() {
    const ps = M().pastos, h = hoje();
    if (!ps.length) return `<section class="card"><h3>Nenhum pasto cadastrado</h3><p class="note" style="margin:8px 0 14px">Cadastre os pastos com área e custo por hectare para o sistema dividir o custo entre os lotes.</p><div class="actions"><button class="btn" type="button" data-act="ir" data-to="pasto/cadastro">Cadastrar pastos</button></div></section>`;
    const semPasto = M().ativos.filter((r) => !r.pastoId || !ps.some((p) => p.pasto.id === r.pastoId));
    return `
    <div class="grid3">${ps.map((p) => `
      <section class="card pcard${p.cabecas ? "" : " vazio"}">
        <div><span class="kicker">${esc(p.pasto.capim || "capim não informado")} · ${n1(p.pasto.area)} ha</span><h3>${esc(p.pasto.nome)}</h3></div>
        ${p.cabecas ? `
        <div class="lotes">${p.lotes.map((r) => `<button type="button" data-act="lote" data-id="${r.lote.id}" aria-label="Abrir lote ${esc(r.lote.numero)}">${tagLote(r.lote)}</button>`).join("")}</div>
        <div class="nums">
          <div><span class="label">Cabeças</span><b>${n0(p.cabecas)}</b></div>
          <div><span class="label">Cab/ha</span><b>${n2(p.lotacao)}</b></div>
          <div><span class="label">Custo/dia</span><b>${rs(p.custoDia, 0)}</b></div>
        </div>
        <p class="note">Ocupado desde ${d2(p.desde)} (${dias(p.desde, h)} dias) · ${rs(p.custoDia / p.cabecas)} por cabeça por dia${p.lotes.some((r) => r.piquete) ? " · piquete " + esc([...new Set(p.lotes.map((r) => r.piquete).filter(Boolean))].join(", ")) : ""}</p>`
        : `<p class="note"><b>Vazio${p.vazioHa != null ? ` há ${p.vazioHa} ${p.vazioHa === 1 ? "dia" : "dias"}` : ""}.</b> Em descanso. Custo de ${rs(p.custoDia)} por dia sem lote para pagar.</p>`}
        ${p.ocioso > 0 ? `<p class="note">Pasto ocioso nos últimos 12 meses: ${rs(p.ocioso, 0)}.</p>` : ""}
      </section>`).join("")}</div>
    ${semPasto.length ? `<div class="banner"><span><b>Lotes sem pasto:</b> ${semPasto.map((r) => esc(r.lote.numero)).join(", ")}. Sem pasto, o custo de pasto não entra na conta do lote.</span><button class="btn sm" type="button" data-act="ir" data-to="pasto/mudanca">Colocar num pasto</button></div>` : ""}
    <div class="actions"><button class="btn" type="button" data-act="ir" data-to="pasto/mudanca">Mudar lote de pasto</button></div>`;
  },
};

// ------------------------------------------------------------ mudança de pasto
TELAS["pasto/mudanca"] = {
  form: () => `
    <form class="card" id="fMov" novalidate>
      <div class="fgrid">
        ${sel("mv-lote", "Lote", opcoesLotes(ativos()))}
        ${campoData("mv-data", "Data da mudança")}
        ${sel("mv-pasto", "Pasto de destino", opcoesPasto())}
        ${campo("mv-piq", "Piquete", { ph: "opcional" })}
      </div>
      <p class="note" id="mv-info"></p>
      <div class="actions"><button class="btn" type="submit">Registrar mudança</button><span class="note">O dia da mudança já conta no pasto novo.</span></div>
    </form>`,
  atualizarForm() {
    const a = $("#mv-lote"), b = $("#mv-pasto"), va = a.value, vb = b.value;
    a.innerHTML = opcoesLotes(ativos(), va); b.innerHTML = opcoesPasto(vb);
    this.info();
  },
  info() {
    const r = M().lote(val("mv-lote"));
    $("#mv-info").textContent = r ? `${r.lote.numero} está em ${nomeDe("pastos", r.pastoId, "nenhum pasto")}${r.desdePasto ? " desde " + d2(r.desdePasto) : ""}.` : "";
  },
  ligar() {
    $("#mv-lote").onchange = () => this.info();
    this.info();
    $("#fMov").onsubmit = (ev) => {
      ev.preventDefault();
      const f = ev.target, l = lotePorId(val("mv-lote")), data = val("mv-data"), pastoId = val("mv-pasto");
      const r = l && M().lote(l.id);
      const e = [];
      if (!l) e.push(["mv-lote", "Escolha o lote."]);
      if (!data) e.push(["mv-data", "Informe a data."]);
      else if (data > hoje()) e.push(["mv-data", "A data não pode ser no futuro."]);
      else if (l && data <= l.dataEntrada) e.push(["mv-data", `O lote entrou em ${d2(l.dataEntrada)}. A mudança precisa ser depois.`]);
      if (!pastoId) e.push(["mv-pasto", "Escolha o pasto de destino."]);
      else if (r && r.pastoId === pastoId && r.piquete === val("mv-piq") && data >= (r.desdePasto || "")) e.push(["mv-pasto", "O lote já está neste pasto."]);
      if (!erros(f, e)) return;
      const mesmoDia = S.db.movs.find((x) => x.loteId === l.id && x.data === data && !x.inicial);
      const dados = { loteId: l.id, data, pastoId, piquete: val("mv-piq") };
      store.gravar([mesmoDia ? { tipo: "update", col: "movs", id: mesmoDia.id, dados } : { tipo: "set", col: "movs", id: store.novoId(), dados }]);
      toast(`${l.numero} mudou para ${nomeDe("pastos", pastoId)}. ${msgSalvo()}`);
      $("#mv-piq").value = "";
    };
  },
  lista() {
    const mv = [...S.db.movs].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 60);
    return `<section class="card"><div class="sec-h"><h3>Histórico de pastos</h3><span class="note">entradas e mudanças</span></div>
    ${mv.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Lote</th><th>Pasto</th><th>Piquete</th><th>Tipo</th></tr></thead><tbody>
    ${mv.map((x) => `<tr class="click" data-act="lote" data-id="${x.loteId}"><td>${d2(x.data)}</td><td>${tagLote(lotePorId(x.loteId))}</td><td>${esc(nomeDe("pastos", x.pastoId, "sem pasto"))}</td><td>${esc(x.piquete) || "—"}</td><td>${x.inicial ? "Entrada" : "Mudança"}</td></tr>`).join("")}
    </tbody></table></div><p class="note" style="margin-top:10px">Para apagar uma mudança, abra o lote e use Excluir no histórico. Para mover só parte de um lote, use a Apartação.</p>` : '<p class="empty">Nenhuma movimentação ainda.</p>'}</section>`;
  },
};

// ------------------------------------------------------------ cadastro de pastos
TELAS["pasto/cadastro"] = {
  form: () => `
    <form class="card" id="fPasto" novalidate>
      <h3>Novo pasto</h3>
      <div class="fgrid">
        ${campo("pa-nome", "Nome do pasto", { ph: "Ex.: Pasto 1" })}
        ${campo("pa-area", "Área (hectares)", { tipo: "number", ph: "20" })}
        ${campo("pa-capim", "Espécie do capim", { ph: "Ex.: Braquiária brizantha" })}
        ${campo("pa-custo", "Custo estimado (R$ por hectare por ano)", { tipo: "number", ph: "730" })}
        ${campo("pa-piq", "Piquetes", { ph: "opcional. Ex.: 1A, 1B, 1C", full: true })}
      </div>
      <p class="note" id="pa-conta"></p>
      <div class="actions"><button class="btn" type="submit">Cadastrar pasto</button></div>
    </form>`,
  ligar() {
    const conta = () => {
      const a = num(val("pa-area")), c = num(val("pa-custo"));
      $("#pa-conta").textContent = a && c != null ? `Custo do pasto: ${rs(a * c)} por ano = ${rs((a * c) / 365)} por dia, dividido pelas cabeças que estiverem nele.` : "";
    };
    $("#fPasto").oninput = conta;
    $("#fPasto").onsubmit = (ev) => {
      ev.preventDefault();
      const f = ev.target, nome = val("pa-nome"), area = num(val("pa-area")), custo = num(val("pa-custo"));
      const e = [];
      if (!nome) e.push(["pa-nome", "Informe o nome."]);
      else if (S.db.pastos.some((p) => p.nome.toLowerCase() === nome.toLowerCase())) e.push(["pa-nome", "Já existe um pasto com esse nome."]);
      if (!area || area <= 0) e.push(["pa-area", "Informe a área em hectares."]);
      if (custo == null || custo < 0) e.push(["pa-custo", "Informe o custo por hectare por ano (pode ser 0)."]);
      if (!erros(f, e)) return;
      // Lançamentos com data anterior ao cadastro usam este primeiro custo.
      store.gravar([{ tipo: "set", col: "pastos", id: store.novoId(), dados: { nome, area, capim: val("pa-capim"), piquetes: val("pa-piq"), precos: [{ desde: hoje(), valor: custo }] } }]);
      toast(`${nome} cadastrado. ${msgSalvo()}`);
      f.reset(); conta();
    };
  },
  lista() {
    const ps = ordenados("pastos");
    if (!ps.length) return "";
    return `<section class="card"><div class="sec-h"><h3>Pastos cadastrados</h3><span class="note">${ps.length} · ${n1(ps.reduce((s, p) => s + (p.area || 0), 0))} ha</span></div>
    <div class="rows">${ps.map((p) => {
      const v = vigente(p.precos, hoje());
      return `<div class="item"><div class="ih"><div><b>${esc(p.nome)}</b><div class="note">${n1(p.area)} ha · ${esc(p.capim || "capim não informado")}${p.piquetes ? " · piquetes: " + esc(p.piquetes) : ""}</div></div>
        <div style="text-align:right"><span class="mono">${rs(v ? v.valor : 0)}/ha/ano</span><div class="note">${rs(v ? (v.valor * p.area) / 365 : 0)} por dia</div></div></div>
        ${histPrecos(p.precos, (x) => rs(x.valor) + "/ha/ano")}
        <details class="mais"><summary>Mudar o custo ou corrigir o cadastro</summary>
          <form class="rowf" data-preco="${p.id}" novalidate>
            ${campo("pp-v-" + p.id, "Novo custo (R$/ha/ano)", { tipo: "number" })}${campoData("pp-d-" + p.id, "Vale a partir de")}
            <button class="btn ghost sm" type="submit">Salvar novo custo</button></form>
          <p class="note" style="margin:8px 0">O custo novo vale só da data informada em diante. Os dias anteriores continuam com o custo antigo.</p>
          <form class="rowf" data-edit="${p.id}" novalidate>
            ${campo("pe-n-" + p.id, "Nome", { v: p.nome })}${campo("pe-a-" + p.id, "Área (ha)", { tipo: "number", v: p.area })}${campo("pe-c-" + p.id, "Capim", { v: p.capim })}${campo("pe-p-" + p.id, "Piquetes", { v: p.piquetes })}
            <button class="btn ghost sm" type="submit">Salvar cadastro</button>
            <button class="mini danger" type="button" data-excluir="${p.id}" data-confirm="Confirmar exclusão do pasto">Excluir pasto</button></form>
        </details></div>`;
    }).join("")}</div></section>`;
  },
  ligarLista() {
    $$("form[data-preco]").forEach((f) => {
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const id = f.dataset.preco, p = S.db.pastos.find((x) => x.id === id), v = num(val("pp-v-" + id)), d = val("pp-d-" + id);
        const e = [];
        if (v == null || v < 0) e.push(["pp-v-" + id, "Informe o custo."]);
        if (!d) e.push(["pp-d-" + id, "Informe a data."]);
        if (!erros(f, e)) return;
        store.gravar([{ tipo: "update", col: "pastos", id, dados: { precos: comPreco(p.precos, { desde: d, valor: v }) } }]);
        toast(`Custo de ${p.nome}: ${rs(v)}/ha/ano a partir de ${d2(d)}.`);
      };
    });
    $$("form[data-edit]").forEach((f) => {
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const id = f.dataset.edit, nome = val("pe-n-" + id), area = num(val("pe-a-" + id));
        const e = [];
        if (!nome) e.push(["pe-n-" + id, "Informe o nome."]);
        if (!area || area <= 0) e.push(["pe-a-" + id, "Informe a área."]);
        if (!erros(f, e)) return;
        store.gravar([{ tipo: "update", col: "pastos", id, dados: { nome, area, capim: val("pe-c-" + id), piquetes: val("pe-p-" + id) } }]);
        toast("Cadastro do pasto atualizado.");
      };
    });
    $$("[data-excluir]").forEach((b) => confirmar(b, () => {
      const id = b.dataset.excluir;
      if (S.db.movs.some((x) => x.pastoId === id)) { toast("Este pasto já recebeu lotes e não pode ser excluído. O histórico de custos depende dele."); return; }
      store.gravar([{ tipo: "delete", col: "pastos", id }]);
      toast("Pasto excluído.");
    }));
  },
};
