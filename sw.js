// Service worker: makes the game work offline.
// Strategy: network first (so updates show up immediately when online), falling back to the cache when
// offline or slow. Bump CACHE when the list of files changes.
const CACHE = 'xmsol-v5';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'LICENSE',
  'css/app.css',
  'js/app.js', 'js/engine.js', 'js/layout.js', 'js/ui.js', 'js/xml.js',
  'rules/manifest.json', 'rules/standard.xml', 'rules/popular.xml',
  'img/classic-cards.png', 'img/classic-back.png', 'img/classic-cell.png',
  'img/modern-cards.png', 'img/modern-back.jpg', 'img/modern-cell.jpg', 'img/bkgnd.jpg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const fromCache = () => cache.match(req, { ignoreSearch: true });
      try {
        const res = await Promise.race([
          fetch(req, { cache: 'no-cache' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 4000)),
        ]);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await fromCache()) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
      }
    }),
  );
});
