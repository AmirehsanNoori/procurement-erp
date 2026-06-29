const CACHE = 'erp-v3';
const STATIC = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png',
];

// Install: pre-cache shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches (bumping CACHE purges the stale index.html that the
// previous cache-first strategy pinned, which froze users on old builds)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// HTML document / navigation requests are served network-first so a new deploy's
// index.html (and therefore its new hashed asset URLs) reaches the user right
// away. Hashed assets under /assets/ are immutable → cache-first.
function isNavigation(request, url) {
  return request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Network-first for API calls and for the HTML shell.
  if (url.pathname.startsWith('/api/') || isNavigation(request, url)) {
    e.respondWith(
      Promise.race([
        fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]).catch(() => caches.match(request).then((c) => c || caches.match('/index.html')))
    );
  } else {
    // Cache-first for immutable hashed assets.
    e.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        });
      })
    );
  }
});
