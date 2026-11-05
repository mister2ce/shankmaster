const CACHE = "shankmaster-v5";
const SHELL = [
  "./", "./index.html", "./css/style.css",
  "./js/supabase-config.js", "./js/supabase-adapter.js",
  "./js/app.js", "./js/golf-sync.js", "./js/tablas.js", "./js/mis-stats.js", "./js/datos-iniciales.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  // Never touch Supabase API traffic; always hit the network for data.
  if (url.includes("supabase.co") || url.includes("/rest/v1/")) return;
  // Network-first for the app shell: always try the network so code/config
  // updates reach the user on next load, and fall back to cache when offline.
  // cache: "no-cache" makes the phone ask GitHub Pages every time, so a new
  // version shows on the next open instead of after its 10-minute HTTP cache.
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
