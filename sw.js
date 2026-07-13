const CACHE_NAME = 'ojolku-cache-v3.5.1'; // NAIKKAN tiap kali index.html/manifest.json berubah
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Ganti sesuai domain/host GAS_URL kamu di index.html.
// Semua request yang cocok pola ini TIDAK PERNAH disentuh cache -- selalu network-only.
const API_HOST_PATTERNS = [
  'script.google.com',
  'script.googleusercontent.com'
];

function isApiRequest(url) {
  return API_HOST_PATTERNS.some((host) => url.includes(host));
}

// Event Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// Event Activate: bersihkan cache lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Menghapus cache lama:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Event Fetch
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 1) Request ke GAS (data keuangan, saldo, dll) -> NETWORK-ONLY.
  //    Tidak pernah dibaca dari cache, tidak pernah ditulis ke cache.
  if (isApiRequest(req.url)) {
    event.respondWith(fetch(req));
    return;
  }

  // 2) index.html & manifest.json -> NETWORK-FIRST.
  //    Selalu coba ambil versi terbaru dari server dulu; fallback ke cache kalau offline.
  //    Ini juga yang bikin update UI kepakai begitu deploy baru, tanpa nunggu 1x buka basi dulu.
  if (req.mode === 'navigate' || req.url.endsWith('index.html') || req.url.endsWith('manifest.json')) {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse.clone()));
          return networkResponse;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 3) Asset statis lain (icon, font, dll) -> stale-while-revalidate seperti semula, ini aman.
  event.respondWith(
    caches.match(req)
      .then((cachedResponse) => {
        const fetchPromise = fetch(req).then((networkResponse) => {
            if (req.url.startsWith('http') && req.method === 'GET') {
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(req, networkResponse.clone());
                });
            }
            return networkResponse;
        }).catch(() => {
            console.log('[Service Worker] Fetch failed, no cache fallback available');
        });

        return cachedResponse || fetchPromise;
      })
  );
});
