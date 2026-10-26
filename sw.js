/* OjolTracker - Service Worker (offline-first)
 * Dasar: sw.js lama (cache versi, GAS network-only, index.html & manifest.json network-first,
 * cache:'no-store' supaya cache HTTP GitHub Pages tidak menahan versi lama).
 * Tambahan: - internet jelek/lambat (>4 detik) -> langsung pakai salinan tersimpan, tidak menggantung
 *           - CSS/JS/font dari CDN (Tailwind, Font Awesome, Google Fonts) ikut disimpan -> tampilan utuh offline
 *           - install tidak gagal total kalau satu file belum ada */
const CACHE_NAME = 'ojolku-cache-v3.13.1'; // NAIKKAN tiap kali index.html/manifest.json/sw.js berubah
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];
const CDN_TO_CACHE = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// Request ke Google Apps Script TIDAK PERNAH disentuh cache (aplikasi yang mengatur
// lewat antrian kirim di index.html).
const API_HOST_PATTERNS = ['script.google.com', 'script.googleusercontent.com'];
function isApiRequest(url) { return API_HOST_PATTERNS.some((host) => url.includes(host)); }

const TIMEOUT_JARINGAN_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(ASSETS_TO_CACHE.map(async (u) => {
      try { const r = await fetch(u, { cache: 'reload' }); if (r && r.ok) await cache.put(u, r); } catch (e) {}
    }));
    await Promise.all(CDN_TO_CACHE.map(async (u) => {
      try { const r = await fetch(u, { mode: 'no-cors' }); await cache.put(u, r); } catch (e) {}
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    ))
  );
  self.clients.claim();
});

async function cariCache(req) {
  return (await caches.match(req, { ignoreSearch: true })) ||
         (await caches.match('./index.html')) ||
         (await caches.match('./'));
}

// Internet dulu (maks 4 detik). Lambat/putus -> salinan tersimpan. Salinan diperbarui di belakang.
function jaringanDulu(req) {
  return new Promise((resolve) => {
    let selesai = false;
    const timer = setTimeout(async () => {
      const c = await cariCache(req);
      if (c && !selesai) { selesai = true; resolve(c); }
    }, TIMEOUT_JARINGAN_MS);

    fetch(req, { cache: 'no-store' }).then(async (res) => {
      clearTimeout(timer);
      if (res && res.ok) {
        const salinan = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, salinan)).catch(() => {});
        if (!selesai) { selesai = true; resolve(res); }
      } else if (!selesai) {
        const c = await cariCache(req);
        selesai = true; resolve(c || res);
      }
    }).catch(async () => {
      clearTimeout(timer);
      if (selesai) return;
      const c = await cariCache(req);
      selesai = true;
      resolve(c || new Response('Offline dan belum ada salinan aplikasi. Buka sekali saat ada internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
    });
  });
}

// Salinan tersimpan dulu, diperbarui diam-diam di belakang (icon, font, CDN).
async function salinanDulu(req) {
  const cache = await caches.open(CACHE_NAME);
  const ada = await cache.match(req);
  const perbarui = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  return ada || (await perbarui) || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (isApiRequest(req.url)) return; // network-only, biar aplikasi yang mengurus

  const url = new URL(req.url);
  if (req.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname.endsWith('manifest.json')) {
    event.respondWith(jaringanDulu(req));
    return;
  }
  if (url.origin === self.location.origin || CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(salinanDulu(req));
  }
});
