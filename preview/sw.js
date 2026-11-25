// Keeps the app working with no signal: serves saved copies, refreshes them when online.
const CACHE = "nzcst-v5";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-192-maskable.png", "icon-512-maskable.png"];
self.addEventListener("install", e => {
  // Cache each file on its own so one missing file can't stop the rest.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  // Only remove this app's old caches: NZCS Forms and SFS Forms share this website's storage.
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("nzcst-") && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// The app asks for this each time it opens: puts back any files that were cleared
// (NZCS Forms' service worker can delete other apps' caches on this website when it updates).
self.addEventListener("message", e => {
  if (e.data === "recache") e.waitUntil(caches.open(CACHE).then(async c => {
    for (const f of FILES) if (!(await c.match(f))) await c.add(f).catch(() => {});
  }));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // Network first so updates show straight away; fall back to the saved copy when offline.
  // "no-cache" makes the browser check GitHub for a newer copy instead of reusing one for up to 10 minutes.
  e.respondWith(fetch(e.request.url, {cache: "no-cache", credentials: "same-origin"}).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then(hit => hit || caches.match("index.html"))));
});
