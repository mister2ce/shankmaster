const CACHE = "shankmaster-v1";
const SHELL = [
  "./", "./index.html", "./css/style.css",
  "./js/supabase-config.js", "./js/supabase-adapter.js",
  "./js/app.js", "./js/datos-iniciales.js",
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
  // Never cache Supabase API traffic; always hit the network for data.
  if (url.includes("supabase.co") || url.includes("/rest/v1/")) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
