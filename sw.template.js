// Service worker: guarda o app no aparelho para ele abrir mesmo sem internet.
// Os DADOS não passam por aqui: quem guarda os dados sem internet é o Firebase.
const VERSAO = "__VERSAO__";
const ARQUIVOS = __ARQUIVOS__;
const CACHE = "gado-" + VERSAO;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("gado-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // Firebase e Google passam direto
  // Abrir a página: tenta a rede (pega versão nova), sem internet usa a cópia guardada.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }
  // Demais arquivos do app: cópia guardada primeiro.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req))
  );
});
