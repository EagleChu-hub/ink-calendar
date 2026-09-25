// 離線快取：網頁、程式與每月內容用「先網路、失敗再用快取」；圖片、字型等素材用「先快取、背景更新」。
// 改版時把 VERSION 加一，舊快取會自動清掉。
const VERSION = 'ink-calendar-v11';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/vendor/lunar.js', 'js/lunar-info.js', 'js/ink.js', 'js/scene.js', 'js/card.js', 'js/export.js', 'js/app.js', 'js/remind.js',
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

  // 網頁、程式、樣式、每月內容：先拿最新的，離線時才用快取。
  // （以前網頁也是先用快取，改版後第一次打開還會看到舊版）
  const fresh = url.origin === location.origin && (
    e.request.mode === 'navigate' || url.pathname.endsWith('/') ||
    /\.(html|js|css|webmanifest)$/.test(url.pathname) || url.pathname.includes('/data/quotes/'));
  if (fresh) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true })),
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

// 每日提醒：calendar-push Worker 送來的推播（內容是 { title, body, url, tag }）
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || '水墨日曆', {
    body: d.body || '今天的一頁已經翻開了。',
    icon: 'icons/icon-192.png',
    tag: d.tag || 'daily',
    data: { url: d.url },
  }));
});

// 點通知：已經開著就切過去並翻到那一天，沒開就開新視窗。只開本站範圍內的網址。
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const scope = self.registration.scope;
  let url = scope;
  try {
    const u = new URL((e.notification.data && e.notification.data.url) || scope, scope);
    if (u.href.startsWith(scope)) url = u.href;
  } catch (err) { /* 網址壞掉就開首頁 */ }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => c.url.startsWith(scope));
      if (win) return win.navigate(url).then((w) => (w || win).focus());
      return self.clients.openWindow(url);
    }),
  );
});
