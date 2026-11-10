// Remove o app antigo guardado neste endereço e manda para o endereço novo.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((cs) => cs.forEach((c) => c.navigate("https://gado-sao-joao.web.app/")))
  );
});
