// Custos fixos (por mês) e custos gerais (diluídos em meses), rateados por cabeça por dia.
import {
  store, S, M, $, $$, esc, d2, n0, rs, num, mesBr, toast, msgSalvo, erros, campo, campoData, sel, seg, val, marcado, confirmar, TELAS, hoje, ui,
} from "./base.js";

const CATS = ["Funcionário", "Diesel", "Manejo", "Herbicida", "Outro"];
const mesAtual = () => hoje().slice(0, 7);
function somaMes(chave, n) {
  const [a, m] = chave.split("-").map(Number), t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
const diasNoMes = (chave) => { const [a, m] = chave.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
const opcoesMes = (v, de = -18, ate = 1) => {
  const o = [];
  for (let i = ate; i >= de; i--) { const k = somaMes(mesAtual(), i); o.push(`<option value="${k}" ${k === v ? "selected" : ""}>${mesBr(k)}</option>`); }
  return o.join("");
};

let mesSel = null;
/** Resumo do mês escolhido: fixos, gerais, por categoria e por cabeça por dia. */
function resumoMensal() {
  if (!mesSel) mesSel = mesAtual();
  const r = M().resumoMes(mesSel);
  const cats = Object.entries(r.categorias).sort((a, b) => b[1] - a[1]);
  return `<section class="card"><div class="sec-h"><h3>Resumo do mês</h3>
    <select id="mesSel" aria-label="Mês do resumo" style="background:#fff;border:1.5px solid var(--line);border-radius:10px;padding:7px 10px">${opcoesMes(mesSel, -24, 12)}</select></div>
    <div class="calc">
      <div><span class="label">Custos fixos</span><b>${rs(r.fixo, 0)}</b></div>
      <div><span class="label">Custos gerais</span><b>${rs(r.geral, 0)}</b><span class="note">parcela do mês</span></div>
      <div><span class="label">Por dia</span><b>${rs(r.total / r.dias, 0)}</b><span class="note">mês de ${r.dias} dias</span></div>
      <div class="res"><span class="label">Por cabeça por dia</span><b>${r.cabDia == null ? "—" : rs(r.cabDia)}</b><span class="note">${r.cabDia == null ? "sem gado na fazenda no mês" : "média dos dias com gado"}</span></div>
      <span class="formula">Valor do mês ÷ dias do mês ÷ cabeças ativas no dia. Cada lote recebe esse valor × as cabeças dele.</span>
    </div>
    ${cats.length ? `<div class="tw" style="margin-top:12px"><table><thead><tr><th>Categoria</th><th class="r">Valor no mês</th><th class="r">Parte</th></tr></thead><tbody>
      ${cats.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${rs(v)}</td><td class="r">${n0((v / r.total) * 100)}%</td></tr>`).join("")}
      <tr><td><b>Total</b></td><td class="r"><b>${rs(r.total)}</b></td><td class="r">100%</td></tr></tbody></table></div>` : `<p class="empty" style="margin-top:10px">Nenhum custo em ${mesBr(mesSel)}.</p>`}
  </section>`;
}
function ligarResumo() {
  const s = $("#mesSel");
  if (s) s.onchange = () => { mesSel = s.value; ui.refazerLista(); };
}
function ligarExcluir() {
  $$("[data-excluir]").forEach((b) => confirmar(b, () => {
    store.gravar([{ tipo: "delete", col: "custos", id: b.dataset.excluir }]);
    toast("Custo excluído. O rateio dos lotes foi refeito.");
  }));
}

// ------------------------------------------------------------ custos fixos
TELAS["custos/fixos"] = {
  form: () => `
    <form class="card" id="fFixo" novalidate>
      <h3>Novo custo fixo</h3>
      <div class="fgrid">
        ${campo("cf-desc", "Descrição", { ph: "Ex.: Salário do vaqueiro" })}
        ${sel("cf-cat", "Categoria", CATS.map((c) => `<option>${c}</option>`).join(""))}
        ${campo("cf-valor", "Valor por mês (R$)", { tipo: "number", ph: "3000" })}
        ${sel("cf-mes", "Mês", opcoesMes(mesAtual()))}
        ${seg("cf-rec", "Repete", [["sim", "Todo mês"], ["nao", "Só neste mês"]], "sim")}
      </div>
      <p class="note" id="cf-conta"></p>
      <div class="actions"><button class="btn" type="submit">Lançar custo fixo</button><span class="note">O custo fixo é dividido por todas as cabeças da fazenda, dia a dia.</span></div>
    </form>`,
  ligar() {
    const conta = () => {
      const v = num(val("cf-valor")), mes = val("cf-mes"), cab = M().fazenda.cabecas;
      $("#cf-conta").textContent = v ? `${rs(v)} ÷ ${diasNoMes(mes)} dias = ${rs(v / diasNoMes(mes))} por dia${cab ? `. Com as ${n0(cab)} cabeças de hoje, ${rs(v / diasNoMes(mes) / cab, 3)} por cabeça por dia.` : "."}` : "";
    };
    const f = $("#fFixo");
    f.addEventListener("input", conta); f.addEventListener("change", conta);
    f.onsubmit = (ev) => {
      ev.preventDefault();
      const descricao = val("cf-desc"), valor = num(val("cf-valor")), mes = val("cf-mes");
      const e = [];
      if (!descricao) e.push(["cf-desc", "Informe a descrição."]);
      if (!valor || valor <= 0) e.push(["cf-valor", "Informe o valor por mês."]);
      if (!erros(f, e)) return;
      const recorrente = marcado("cf-rec") === "sim";
      store.gravar([{ tipo: "set", col: "custos", id: store.novoId(), dados: { tipo: "fixo", descricao, categoria: val("cf-cat"), valor, mes, recorrente } }]);
      toast(`${descricao}: ${rs(valor)} ${recorrente ? "por mês a partir de " + mesBr(mes) : "em " + mesBr(mes)}. ${msgSalvo()}`);
      $("#cf-desc").value = ""; $("#cf-valor").value = ""; conta();
    };
  },
  lista() {
    const cs = S.db.custos.filter((c) => c.tipo === "fixo").sort((a, b) => b.mes.localeCompare(a.mes) || a.descricao.localeCompare(b.descricao));
    const periodo = (c) => (!c.recorrente ? "só " + mesBr(c.mes) : c.ate ? `${mesBr(c.mes)} a ${mesBr(c.ate)}` : `todo mês desde ${mesBr(c.mes)}`);
    return resumoMensal() + `<section class="card"><div class="sec-h"><h3>Custos fixos lançados</h3><span class="note">${cs.length}</span></div>
    ${cs.length ? `<div class="rows">${cs.map((c) => `<div class="item"><div class="ih"><div><b>${esc(c.descricao)}</b><div class="note">${esc(c.categoria || "Outro")} · ${periodo(c)}</div></div>
      <div style="text-align:right"><span class="mono">${rs(c.valor)}/mês</span></div></div>
      <div class="actions">${c.recorrente && !c.ate ? `<button class="mini" type="button" data-encerrar="${c.id}" data-confirm="Confirmar: ${mesBr(mesAtual())} é o último mês">Encerrar neste mês</button>` : ""}
      <button class="mini danger" type="button" data-excluir="${c.id}" data-confirm="Confirmar exclusão">Excluir</button></div></div>`).join("")}</div>
      <p class="note" style="margin-top:10px">Mudou o valor? Encerre o custo antigo e lance um novo a partir do mês seguinte. Assim os meses passados ficam com o valor antigo.</p>` : '<p class="empty">Nenhum custo fixo lançado ainda.</p>'}</section>`;
  },
  ligarLista() {
    ligarResumo(); ligarExcluir();
    $$("[data-encerrar]").forEach((b) => confirmar(b, () => {
      const c = S.db.custos.find((x) => x.id === b.dataset.encerrar);
      store.gravar([{ tipo: "update", col: "custos", id: c.id, dados: { ate: mesAtual() < c.mes ? c.mes : mesAtual() } }]);
      toast(`${c.descricao} encerrado. Último mês: ${mesBr(mesAtual() < c.mes ? c.mes : mesAtual())}.`);
    }));
  },
};

// ------------------------------------------------------------ custos gerais
TELAS["custos/gerais"] = {
  form: () => `
    <form class="card" id="fGeral" novalidate>
      <h3>Novo custo geral</h3>
      <div class="fgrid">
        ${campo("cg-desc", "Descrição", { ph: "Ex.: Reforma do pasto 3", full: true })}
        ${campoData("cg-data", "Data do gasto")}
        ${campo("cg-valor", "Valor total (R$)", { tipo: "number", ph: "36000" })}
        ${campo("cg-meses", "Diluir em quantos meses", { tipo: "number", modo: "numeric", passo: 1, v: 12 })}
      </div>
      <p class="note" id="cg-conta"></p>
      <div class="actions"><button class="btn" type="submit">Lançar custo geral</button><span class="note">O gasto é dividido em parcelas mensais e rateado como um custo fixo.</span></div>
    </form>`,
  ligar() {
    const conta = () => {
      const v = num(val("cg-valor")), n = Math.round(num(val("cg-meses")) || 0), d = val("cg-data");
      $("#cg-conta").textContent = v && n >= 1 && d ? `${rs(v)} ÷ ${n} ${n === 1 ? "mês" : "meses"} = ${rs(v / n)} por mês, de ${mesBr(d.slice(0, 7))} a ${mesBr(somaMes(d.slice(0, 7), n - 1))}.` : "";
    };
    const f = $("#fGeral");
    f.addEventListener("input", conta); conta();
    f.onsubmit = (ev) => {
      ev.preventDefault();
      const descricao = val("cg-desc"), data = val("cg-data"), valor = num(val("cg-valor")), meses = Math.round(num(val("cg-meses")) || 0);
      const e = [];
      if (!descricao) e.push(["cg-desc", "Informe a descrição."]);
      if (!data) e.push(["cg-data", "Informe a data."]);
      if (!valor || valor <= 0) e.push(["cg-valor", "Informe o valor."]);
      if (meses < 1 || meses > 240) e.push(["cg-meses", "Informe em quantos meses diluir (1 ou mais)."]);
      if (!erros(f, e)) return;
      store.gravar([{ tipo: "set", col: "custos", id: store.novoId(), dados: { tipo: "geral", descricao, data, valor, meses } }]);
      toast(`${descricao}: ${rs(valor / meses)} por mês em ${meses} ${meses === 1 ? "mês" : "meses"}. ${msgSalvo()}`);
      $("#cg-desc").value = ""; $("#cg-valor").value = ""; conta();
    };
  },
  lista() {
    const cs = S.db.custos.filter((c) => c.tipo === "geral").sort((a, b) => b.data.localeCompare(a.data));
    const at = mesAtual();
    return resumoMensal() + `<section class="card"><div class="sec-h"><h3>Custos gerais lançados</h3><span class="note">${cs.length}</span></div>
    ${cs.length ? `<div class="rows">${cs.map((c) => {
      const n = Math.max(1, c.meses || 1), m0 = c.data.slice(0, 7), fim = somaMes(m0, n - 1);
      let passados = 0;
      for (let i = 0; i < n; i++) if (somaMes(m0, i) <= at) passados++;
      return `<div class="item"><div class="ih"><div><b>${esc(c.descricao)}</b><div class="note">${d2(c.data)} · ${n} ${n === 1 ? "mês" : "meses"}, de ${mesBr(m0)} a ${mesBr(fim)}</div></div>
        <div style="text-align:right"><span class="mono">${rs(c.valor)}</span><div class="note">${rs(c.valor / n)} por mês</div></div></div>
        <div class="barra" role="img" aria-label="${passados} de ${n} meses"><i style="width:${(passados / n) * 100}%;background:var(--grass)"></i></div>
        <div class="actions"><span class="note">${passados} de ${n} ${n === 1 ? "mês" : "meses"} já ${passados === 1 ? "entrou" : "entraram"} no rateio</span><button class="mini danger" type="button" data-excluir="${c.id}" data-confirm="Confirmar exclusão">Excluir</button></div></div>`;
    }).join("")}</div>` : '<p class="empty">Nenhum custo geral lançado ainda.</p>'}</section>`;
  },
  ligarLista() { ligarResumo(); ligarExcluir(); },
};
