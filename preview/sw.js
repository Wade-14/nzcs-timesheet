// Keeps the app working with no signal: serves saved copies, refreshes them when online.
const CACHE = "nzcst-v7";
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

// Admin phone alerts: the server sends an empty "ping"; we ask what it was about and show it (tap opens the Dashboard).
const API = /^(localhost|127\.0\.0\.1)$/.test(self.location.hostname) ? "http://localhost:8787" : "https://nzcs-timesheet-api.royal-dawn-9e17.workers.dev";
async function showNotices(){
  let notices = [];
  try{
    const sub = await self.registration.pushManager.getSubscription();
    const r = await fetch(API + "/api/push/notices", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({endpoint: sub ? sub.endpoint : ""})});
    if (r.ok) notices = (await r.json()).notices || [];
  }catch(e){}
  if (!notices.length) notices = [{id: "latest", title: "New request to approve", body: "Open the Dashboard to see it.", url: "#dash"}];
  for (const n of notices)
    await self.registration.showNotification(n.title, {body: n.body, icon: "icon-192.png", badge: "icon-192.png", tag: "nzcst-" + n.id, data: {url: self.registration.scope + (n.url || "#dash")}});
}
self.addEventListener("push", e => { e.waitUntil(showNotices()); });
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && "focus" in c){ c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
