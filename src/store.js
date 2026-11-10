// Onde os dados ficam guardados.
//  - Modo nuvem: Firebase Firestore, com cópia no aparelho. Sem internet, os lançamentos
//    ficam guardados no aparelho e sobem sozinhos quando a conexão volta.
//  - Modo demonstração: quando ainda não há configuração do Firebase. Os dados ficam só
//    neste navegador, com exemplos, para testar as telas.
import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut,
  connectAuthEmulator, signInWithCredential,
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, writeBatch, connectFirestoreEmulator,
} from "firebase/firestore";
import { firebaseConfig, FAZENDA_ID } from "./firebase-config.js";
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
  if (emulador) return storeNuvem(avisar, { apiKey: "demo-key", projectId: "demo-gado", authDomain: "localhost", appId: "demo" }, true);
  const temConfig = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId;
  return temConfig ? storeNuvem(avisar, firebaseConfig, false) : storeDemo(avisar);
}

// ---------------------------------------------------------------- nuvem
function storeNuvem(avisar, config, emulador) {
  const app = initializeApp(config);
  const auth = getAuth(app);
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
    usuario: undefined, // undefined = ainda verificando; null = não entrou
    carregado: false,
    online: navigator.onLine,
    pendentes: 0,
    erro: null,
  };
  const pendDocs = Object.fromEntries(COLECOES.map((c) => [c, 0]));
  let excluindo = 0;
  let pararOuvir = [];
  let tentarDeNovo = null;

  const ref = (col, id) => doc(fs, "fazendas", FAZENDA_ID, col, id);
  const recontar = () => {
    S.pendentes = COLECOES.reduce((s, c) => s + pendDocs[c], 0) + excluindo;
  };

  function ouvir() {
    pararOuvir.forEach((f) => f());
    const prontos = new Set();
    pararOuvir = COLECOES.map((col) =>
      onSnapshot(
        collection(fs, "fazendas", FAZENDA_ID, col),
        { includeMetadataChanges: true },
        (snap) => {
          S.db[col] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          pendDocs[col] = snap.docs.filter((d) => d.metadata.hasPendingWrites).length;
          recontar();
          prontos.add(col);
          if (prontos.size === COLECOES.length) S.carregado = true;
          S.erro = null;
          avisar();
        },
        (err) => {
          S.erro = err.code === "permission-denied" ? "sem-acesso" : "Erro ao ler os dados: " + err.message;
          S.carregado = true;
          avisar();
          // Tenta de novo depois de um tempo (ex.: as regras de acesso acabaram de ser liberadas).
          clearTimeout(tentarDeNovo);
          tentarDeNovo = setTimeout(() => { if (auth.currentUser) ouvir(); }, 20000);
        }
      )
    );
  }

  onAuthStateChanged(auth, (u) => {
    S.usuario = u ? { nome: u.displayName, email: u.email, foto: u.photoURL } : null;
    if (u) ouvir();
    else {
      pararOuvir.forEach((f) => f());
      pararOuvir = [];
      S.db = vazio();
      S.carregado = false;
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
      .catch((err) => {
        S.erro = err.code === "permission-denied"
          ? "sem-acesso"
          : "Não foi possível salvar: " + err.message;
      })
      .finally(() => { excluindo -= apagando; recontar(); avisar(); });
    avisar();
  }

  return {
    S,
    novoId: () => doc(collection(fs, "fazendas", FAZENDA_ID, "lotes")).id,
    gravar,
    async entrar() {
      const prov = new GoogleAuthProvider();
      prov.setCustomParameters({ prompt: "select_account" });
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

// Firestore não aceita campos "undefined".
function limpar(o) {
  return Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== undefined && k !== "id"));
}

// ---------------------------------------------------------------- demonstração
function storeDemo(avisar) {
  const CHAVE = "gado-demo-v1";
  let db;
  try { db = JSON.parse(localStorage.getItem(CHAVE)); } catch { db = null; }
  if (!db || !db.lotes) db = exemplo();
  const S = {
    modo: "demo",
    db,
    usuario: { nome: "Demonstração", email: "" },
    carregado: true,
    online: navigator.onLine,
    pendentes: 0,
    erro: null,
  };
  const persistir = () => {
    try { localStorage.setItem(CHAVE, JSON.stringify(S.db)); } catch { /* sem espaço ou bloqueado */ }
  };
  const mudouRede = () => { S.online = navigator.onLine; avisar(); };
  addEventListener("online", mudouRede);
  addEventListener("offline", mudouRede);

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
    async entrar() {},
    async sair() {},
    restaurarExemplo() { S.db = exemplo(); persistir(); avisar(); },
  };
}
