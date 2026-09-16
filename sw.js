// Cache strategy: network-first for same-origin GETs, falling back to the
// cache when offline. Deliberately NOT cache-first — that version pinned
// whatever js/db.js and js/app.js were cached at install time, so shipping
// new code required remembering to bump CACHE by hand. Forgetting once
// (f36c2ab, which added new default exercises) left installed PWAs serving
// stale code indefinitely with no way for the user to tell.
const CACHE = 'workout-tracker-v8';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Only cache real responses; an opaque or error response would
        // otherwise poison the cache and be served back when offline.
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          // A navigation that missed the cache (deep link, offline) still
          // needs the shell back, or the user just sees a browser error.
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        })
      )
  );
});
