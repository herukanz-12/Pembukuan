const CACHE_NAME = 'ojolku-cache-v2.4';
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Event Install: Menyimpan file-file penting ke dalam cache
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

// Event Activate: Membersihkan cache lama jika ada versi baru
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

// Event Fetch: Strategi Stale-While-Revalidate (Ambil dari cache dulu, lalu update di background)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Return cache jika ada, jika tidak, fetch dari jaringan
        const fetchPromise = fetch(event.request).then((networkResponse) => {
            // Update cache dengan versi terbaru (kecuali untuk request API)
            if (event.request.url.startsWith('http') && event.request.method === 'GET') {
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                });
            }
            return networkResponse;
        }).catch(() => {
            // Jika gagal network dan tidak ada di cache
            console.log('[Service Worker] Fetch failed, returning offline page/data');
        });

        return cachedResponse || fetchPromise;
      })
  );
});
