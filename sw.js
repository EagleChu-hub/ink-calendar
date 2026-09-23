// 離線快取：程式與素材用「先快取、背景更新」，每月內容用「先網路、失敗再用快取」。
// 改版時把 VERSION 加一，舊快取會自動清掉。
const VERSION = 'ink-calendar-v7';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/vendor/lunar.js', 'js/lunar-info.js', 'js/ink.js', 'js/scene.js', 'js/card.js', 'js/export.js', 'js/app.js',
  'data/festivals-tw.json', 'data/scenes.json', 'assets/seal/chosen.svg',
  'icons/icon-192.png', 'icons/favicon-32.png',
];
// 山水素材（assets/landscape/*.svg）用到才快取，不在安裝時一次下載

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // 每月內容：先拿最新的，離線時用快取
  if (url.origin === location.origin && url.pathname.includes('/data/quotes/')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
    return;
  }

  // 其他（含 Google Fonts）：有快取就先用，同時在背景更新
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request)
        .then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
