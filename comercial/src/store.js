// Onde os dados ficam guardados.
//  - Modo nuvem: Firebase Firestore, com cópia no aparelho. Sem internet, os lançamentos
//    ficam guardados no aparelho e sobem sozinhos quando a conexão volta.
//  - Modo demonstração: quando ainda não há configuração do Firebase. Os dados ficam só
//    neste navegador, com exemplos, para testar as telas.
import { initializeApp } from "firebase/app";
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver,
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut,
  connectAuthEmulator, signInWithCredential,
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, writeBatch, connectFirestoreEmulator,
  setDoc, updateDoc, getDocs, query, limit, Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";
import { exemplo } from "./exemplo.js";

export const COLECOES = ["lotes", "pesagens", "sanidade", "saidas"];

function vazio() {
  return { lotes: [], pesagens: [], sanidade: [], saidas: [] };
}

function idNovo() {
  const a = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

export function criarStore(avisar) {
  // Teste local com os emuladores do Firebase: http://localhost:8080/?emulador
  const emulador = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("emulador");
  if (emulador) return storeNuvem(avisar, { apiKey: "demo-key", projectId: "demo-lote-certo", authDomain: "localhost", appId: "demo" }, true);
  const temConfig = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId;
  return temConfig ? storeNuvem(avisar, firebaseConfig, false) : storeDemo(avisar);
}

// ---------------------------------------------------------------- nuvem
// Estrutura no banco:
//   contas/{uid}                                  cadastro de quem entrou (e-mail, nome)
//   contas/{uid}/fazendas/{fazenda}               fazendas da conta
//   contas/{uid}/fazendas/{fazenda}/{coleção}/…   lotes, pesagens, sanidade, saídas
//   contas/{uid}/membros/{e-mail}                 sócio ou funcionário com acesso
//   convites/{e-mail}                             diz a quem entra de qual conta ele é membro
//   assinaturas/{uid}                             assinatura da conta (só o administrador grava)
function storeNuvem(avisar, config, emulador) {
  const app = initializeApp(config);
  // A sessão fica guardada no aparelho (não some ao fechar o navegador ou o app).
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  const fs = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (emulador) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(fs, "127.0.0.1", 8085);
    window.__entrarTeste = (email) => signInWithCredential(auth,
      GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
  }

  const S = {
    modo: "nuvem",
    db: vazio(),
    usuario: undefined,   // undefined = ainda verificando; null = não entrou
    conta: null,          // { id, minha, donoNome } · de quem são os dados que estou vendo
    assinatura: undefined, // undefined = verificando; null = não tem; { ativa, ate }
    fazendas: null,       // null = ainda buscando
    fazendaId: null,
    membros: [],
    admin: false,
    adminContas: null,    // só para o administrador: lista de contas com a assinatura de cada uma
    carregado: false,
    online: navigator.onLine,
    pendentes: 0,
    erro: null,
  };
  const pendDocs = Object.fromEntries(COLECOES.map((c) => [c, 0]));
  let excluindo = 0;
  let uid = null, email = "";
  let parar = { convite: [], conta: [], fazenda: [], admin: [] };
  const soltar = (k) => { parar[k].forEach((f) => f()); parar[k] = []; };

  const raizFaz = () => ["contas", S.conta.id, "fazendas", S.fazendaId];
  const ref = (col, id) => doc(fs, ...raizFaz(), col, id);
  const recontar = () => {
    S.pendentes = COLECOES.reduce((s, c) => s + pendDocs[c], 0) + excluindo;
  };
  const falha = (err, onde) => {
    S.erro = err.code === "permission-denied" ? "sem-acesso" : `Erro ao ${onde}: ${err.message}`;
    avisar();
  };

  // 3º passo: os dados da fazenda escolhida.
  function ouvirFazenda() {
    soltar("fazenda");
    S.db = vazio();
    S.carregado = false;
    COLECOES.forEach((c) => { pendDocs[c] = 0; });
    recontar();
    if (!S.fazendaId) { avisar(); return; }
    const prontos = new Set();
    parar.fazenda = COLECOES.map((col) =>
      onSnapshot(collection(fs, ...raizFaz(), col), { includeMetadataChanges: true },
        (snap) => {
          S.db[col] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          pendDocs[col] = snap.docs.filter((d) => d.metadata.hasPendingWrites).length;
          recontar();
          prontos.add(col);
          if (prontos.size === COLECOES.length) S.carregado = true;
          S.erro = null;
          avisar();
        },
        (err) => { S.carregado = true; falha(err, "ler os dados"); }));
    avisar();
  }

  function escolherFazenda(id) {
    if (id === S.fazendaId) return;
    S.fazendaId = id;
    guardar("lc-fazenda-" + S.conta.id, id || "");
    ouvirFazenda();
  }

  // 2º passo: assinatura e fazendas da conta (a minha, ou a de quem me convidou).
  function ouvirConta(contaId, donoNome) {
    if (S.conta && S.conta.id === contaId) return;
    soltar("conta"); soltar("fazenda");
    S.conta = { id: contaId, minha: contaId === uid, donoNome: donoNome || "" };
    S.assinatura = undefined; S.fazendas = null; S.fazendaId = null; S.membros = [];
    S.db = vazio(); S.carregado = false;

    let ativaAntes = null;
    parar.conta.push(onSnapshot(doc(fs, "assinaturas", contaId), (d) => {
      const a = d.exists() ? d.data() : null;
      S.assinatura = a ? { ativa: a.ativa === true, ate: a.ate ? a.ate.toMillis() : null, obs: a.obs || "" } : null;
      const ativa = assinaturaAtiva(S.assinatura);
      if (ativa && ativaAntes !== true) ouvirFazendas();
      ativaAntes = ativa;
      avisar();
    }, (err) => { S.assinatura = null; falha(err, "ler a assinatura"); }));

    let jaOuvindo = false;
    function ouvirFazendas() {
      if (jaOuvindo) return;
      jaOuvindo = true;
      parar.conta.push(onSnapshot(collection(fs, "contas", contaId, "fazendas"), (snap) => {
        S.fazendas = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
          .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR", { numeric: true }));
        S.erro = null;
        const guardada = ler("lc-fazenda-" + contaId);
        if (!S.fazendas.some((f) => f.id === S.fazendaId)) {
          const alvo = S.fazendas.find((f) => f.id === guardada) || S.fazendas[0];
          S.fazendaId = null;
          escolherFazenda(alvo ? alvo.id : null);
        }
        avisar();
      }, (err) => { S.fazendas = []; falha(err, "ler as fazendas"); }));
      if (contaId === uid) {
        parar.conta.push(onSnapshot(collection(fs, "contas", contaId, "membros"), (snap) => {
          S.membros = snap.docs.map((d) => ({ ...d.data(), email: d.id })).sort((a, b) => a.email.localeCompare(b.email));
          avisar();
        }, () => {}));
      }
    }
    avisar();
  }

  onAuthStateChanged(auth, (u) => {
    Object.keys(parar).forEach(soltar);
    S.usuario = u ? { nome: u.displayName, email: u.email, foto: u.photoURL } : null;
    S.conta = null; S.assinatura = undefined; S.fazendas = null; S.fazendaId = null;
    S.membros = []; S.admin = false; S.adminContas = null; S.db = vazio(); S.carregado = false; S.erro = null;
    uid = u ? u.uid : null;
    email = u ? String(u.email || "").toLowerCase() : "";
    if (u) {
      lembrar(u.email);
      // Pede ao navegador para não apagar os dados do app (sessão e lançamentos sem internet).
      navigator.storage?.persist?.().catch(() => {});
      // Cadastro da conta: é por ele que o administrador encontra quem liberar.
      setDoc(doc(fs, "contas", uid), { email, nome: u.displayName || "", atualizadoEm: new Date().toISOString() }, { merge: true })
        .catch(() => {});
      // 1º passo: sou membro da conta de alguém? Se não, a conta é a minha.
      parar.convite.push(onSnapshot(doc(fs, "convites", email), (d) => {
        const c = d.exists() ? d.data() : null;
        if (c && c.donoUid && c.donoUid !== uid) ouvirConta(c.donoUid, c.donoNome);
        else ouvirConta(uid);
      }, () => ouvirConta(uid)));
      // Administrador: só ele consegue listar as contas.
      getDocs(query(collection(fs, "contas"), limit(1)))
        .then(() => { S.admin = true; avisar(); })
        .catch(() => {});
    }
    avisar();
  });

  const mudouRede = () => { S.online = navigator.onLine; avisar(); };
  addEventListener("online", mudouRede);
  addEventListener("offline", mudouRede);

  /** Grava várias mudanças juntas (ou todas, ou nenhuma). Não espera a internet. */
  function gravar(ops) {
    const b = writeBatch(fs);
    const agora = new Date().toISOString();
    let apagando = 0;
    for (const op of ops) {
      const r = ref(op.col, op.id);
      if (op.tipo === "set") b.set(r, { ...limpar(op.dados), criadoEm: agora, atualizadoEm: agora });
      else if (op.tipo === "update") b.update(r, { ...limpar(op.dados), atualizadoEm: agora });
      else if (op.tipo === "delete") { b.delete(r); apagando++; }
    }
    excluindo += apagando;
    recontar();
    b.commit()
      .catch((err) => falha(err, "salvar"))
      .finally(() => { excluindo -= apagando; recontar(); avisar(); });
    avisar();
  }
  const semEspera = (p, onde) => { p.catch((err) => falha(err, onde)); avisar(); };

  return {
    S,
    novoId: () => doc(collection(fs, "contas", uid, "fazendas")).id,
    gravar,
    escolherFazenda,
    criarFazenda(nome) {
      const r = doc(collection(fs, "contas", S.conta.id, "fazendas"));
      const agora = new Date().toISOString();
      semEspera(setDoc(r, { nome, criadoEm: agora, atualizadoEm: agora }), "criar a fazenda");
      escolherFazenda(r.id);
      return r.id;
    },
    renomearFazenda(id, nome) {
      semEspera(updateDoc(doc(fs, "contas", S.conta.id, "fazendas", id), { nome, atualizadoEm: new Date().toISOString() }), "renomear a fazenda");
    },
    // Sócio ou funcionário: passa a ver e lançar nas fazendas desta conta.
    async convidar(emailMembro) {
      const em = emailMembro.trim().toLowerCase();
      const b = writeBatch(fs);
      const agora = new Date().toISOString();
      b.set(doc(fs, "convites", em), { donoUid: uid, donoNome: S.usuario.nome || S.usuario.email, criadoEm: agora });
      b.set(doc(fs, "contas", uid, "membros", em), { criadoEm: agora });
      await b.commit();
    },
    async removerMembro(em) {
      const b = writeBatch(fs);
      b.delete(doc(fs, "convites", em));
      b.delete(doc(fs, "contas", uid, "membros", em));
      await b.commit();
    },
    // ---- administrador
    ouvirAdmin() {
      if (parar.admin.length || !S.admin) return;
      let contas = [], ass = {};
      const juntar = () => {
        S.adminContas = contas.map((c) => ({ ...c, assinatura: ass[c.id] || null }))
          .sort((a, b) => String(b.atualizadoEm || "").localeCompare(String(a.atualizadoEm || "")));
        avisar();
      };
      parar.admin.push(onSnapshot(collection(fs, "contas"), (s) => { contas = s.docs.map((d) => ({ ...d.data(), id: d.id })); juntar(); }, () => {}));
      parar.admin.push(onSnapshot(collection(fs, "assinaturas"), (s) => {
        ass = Object.fromEntries(s.docs.map((d) => { const a = d.data(); return [d.id, { ativa: a.ativa === true, ate: a.ate ? a.ate.toMillis() : null, obs: a.obs || "" }]; }));
        juntar();
      }, () => {}));
    },
    /** ate: "AAAA-MM-DD" (vale até o fim desse dia) ou "" para sem prazo. */
    async definirAssinatura(contaId, { ativa, ate, obs }) {
      await setDoc(doc(fs, "assinaturas", contaId), {
        ativa: !!ativa,
        ate: ate ? Timestamp.fromDate(new Date(ate + "T23:59:59")) : null,
        obs: obs || "",
        atualizadoEm: new Date().toISOString(),
        atualizadoPor: email,
      });
    },
    async entrar() {
      const prov = new GoogleAuthProvider();
      // Já sugere a última conta usada, para não precisar digitar o e-mail.
      const ultimo = ultimoEmail();
      if (ultimo) prov.setCustomParameters({ login_hint: ultimo });
      try {
        await signInWithPopup(auth, prov);
      } catch (e) {
        if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
          await signInWithRedirect(auth, prov);
        } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
          throw e;
        }
      }
    },
    sair: () => signOut(auth),
  };
}

/** A assinatura vale se está ativa e, quando tem prazo, o prazo ainda não venceu. */
export function assinaturaAtiva(a) {
  return !!a && a.ativa === true && (!a.ate || a.ate > Date.now());
}
const ler = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* bloqueado */ } };

// Último e-mail que entrou neste aparelho (só para sugerir no login).
const CHAVE_EMAIL = "lc-ultimo-email";
export function ultimoEmail() {
  try { return localStorage.getItem(CHAVE_EMAIL) || ""; } catch { return ""; }
}
function lembrar(email) {
  try { if (email) localStorage.setItem(CHAVE_EMAIL, email); } catch { /* bloqueado */ }
}

// Firestore não aceita campos "undefined".
function limpar(o) {
  return Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== undefined && k !== "id"));
}

// ---------------------------------------------------------------- demonstração
function storeDemo(avisar) {
  const CHAVE = "lc-demo-v1";
  let tudo;
  try { tudo = JSON.parse(localStorage.getItem(CHAVE)); } catch { tudo = null; }
  if (!tudo || !tudo.fazendas || !tudo.fazendas.length) tudo = { fazendas: [{ id: "exemplo", nome: "Fazenda Boa Vista" }], dados: { exemplo: exemplo() }, atual: "exemplo" };
  const S = {
    modo: "demo",
    db: tudo.dados[tudo.atual] || vazio(),
    usuario: { nome: "Demonstração", email: "" },
    conta: { id: "demo", minha: true, donoNome: "" },
    assinatura: { ativa: true, ate: null },
    fazendas: tudo.fazendas,
    fazendaId: tudo.atual,
    membros: [],
    admin: false,
    adminContas: null,
    carregado: true,
    online: navigator.onLine,
    pendentes: 0,
    erro: null,
  };
  const persistir = () => {
    tudo.dados[S.fazendaId] = S.db; tudo.atual = S.fazendaId; tudo.fazendas = S.fazendas;
    try { localStorage.setItem(CHAVE, JSON.stringify(tudo)); } catch { /* sem espaço ou bloqueado */ }
  };
  const mudouRede = () => { S.online = navigator.onLine; avisar(); };
  addEventListener("online", mudouRede);
  addEventListener("offline", mudouRede);
  const escolherFazenda = (id) => { persistir(); S.fazendaId = id; S.db = tudo.dados[id] || (tudo.dados[id] = vazio()); persistir(); avisar(); };

  return {
    S,
    novoId: idNovo,
    gravar(ops) {
      const agora = new Date().toISOString();
      for (const op of ops) {
        const lista = S.db[op.col];
        const i = lista.findIndex((x) => x.id === op.id);
        if (op.tipo === "set") lista.push({ ...op.dados, id: op.id, criadoEm: agora, atualizadoEm: agora });
        else if (op.tipo === "update" && i >= 0) lista[i] = { ...lista[i], ...op.dados, atualizadoEm: agora };
        else if (op.tipo === "delete" && i >= 0) lista.splice(i, 1);
      }
      persistir();
      avisar();
    },
    escolherFazenda,
    criarFazenda(nome) { const id = idNovo(); S.fazendas = [...S.fazendas, { id, nome }]; tudo.dados[id] = vazio(); escolherFazenda(id); return id; },
    renomearFazenda(id, nome) { S.fazendas = S.fazendas.map((f) => (f.id === id ? { ...f, nome } : f)); persistir(); avisar(); },
    async convidar() { throw new Error("O acesso para outras pessoas só funciona com o banco na nuvem ligado."); },
    async removerMembro() {},
    ouvirAdmin() {},
    async definirAssinatura() {},
    async entrar() {},
    async sair() {},
    restaurarExemplo() { S.db = exemplo(); persistir(); avisar(); },
  };
}
