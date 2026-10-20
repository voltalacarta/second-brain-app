// Mette in cache SOLO i file dell'app (stessa origine). Le note e il token non passano mai da qui.
const CACHE = "second-brain-app-__VERSIONE__";
const FILE = ["./", "index.html", "app.css?v=__VERSIONE__", "js/main.js?v=__VERSIONE__", "js/github.js", "js/md.js", "js/util.js", "js/grafo.js", "js/editor.js", "icona.svg", "manifest.webmanifest"];

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return; // api.github.com: mai in cache
  // rete prima (così un aggiornamento arriva subito), cache se si è offline
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: false }).then(r => r || caches.match("index.html"))));
});
