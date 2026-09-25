// 每日提醒（Web Push）：訂閱後，calendar-push Worker 每天在選定的整點（台北時間）送出當天內容。
// 本機預覽時改連 wrangler dev（localhost:8787）。
(function () {
  const APP = 'ink';
  const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
  const PUSH_API = LOCAL ? 'http://localhost:8787' : 'https://calendar-push.eaglechu.workers.dev';
  const VAPID_PUBLIC_KEY = 'BKPrh8phdb_4Dw5C4IQzgXLiqutVXZmACvjIoIgO8pshXjtkN22Cn99URJm2ytkd8m1Tzu7ezhjX29kGxCdS4oo';
  const HOUR_KEY = `${APP}-remind-hour`;
  const DEFAULT_HOUR = 8;

  const $ = (id) => document.getElementById(id);
  const sheet = $('remind-sheet');
  const select = $('remind-hour');
  const status = $('remind-status');
  const onBtn = $('remind-on');
  const offBtn = $('remind-off');
  const pad = (n) => String(n).padStart(2, '0');

  for (let h = 6; h <= 23; h++) select.add(new Option(`${pad(h)}:00`, String(h)));

  function savedHour() {
    try { const v = localStorage.getItem(HOUR_KEY); return v === null ? null : Number(v); } catch (e) { return null; }
  }
  function saveHour(h) {
    try { if (h === null) localStorage.removeItem(HOUR_KEY); else localStorage.setItem(HOUR_KEY, String(h)); } catch (e) { /* 無痕模式等情況：只影響顯示 */ }
  }

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const inArtifact = !!(window.claude && typeof window.claude.use === 'function');

  // 不能用的原因；null 表示可以用
  function blocker() {
    if (inArtifact) return '這個預覽環境不能開啟推播，請到正式網站開啟。';
    if (isIOS && !standalone) {
      return 'iPhone、iPad 要先把日曆加入主畫面：用 Safari 打開本站 → 分享 →「加入主畫面」，再從主畫面的圖示打開，就能開啟提醒（需 iOS 16.4 以上）。';
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !window.isSecureContext) {
      return '這個瀏覽器不支援推播通知。可以改用手機的 Chrome，或 iPhone 加入主畫面後使用。';
    }
    if (Notification.permission === 'denied') {
      return '通知權限已被關閉。請到瀏覽器（或手機系統）的網站設定，允許本站傳送通知後再試一次。';
    }
    return null;
  }

  async function currentSubscription() {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  }

  function keyBytes(b64url) {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  async function post(path, body) {
    const r = await fetch(PUSH_API + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`伺服器回應 ${r.status}`);
    return r.json();
  }

  function show(sub) {
    const h = savedHour();
    select.value = String(sub && h !== null ? h : DEFAULT_HOUR);
    offBtn.hidden = !sub;
    onBtn.textContent = sub ? '更新時間' : '開啟提醒';
    status.textContent = sub
      ? `已開啟：每天 ${pad(h !== null ? h : DEFAULT_HOUR)}:00 提醒你翻開今天的一頁。`
      : '每天在你選的時間，跳出今天的內容。';
  }

  async function refresh() {
    const why = blocker();
    onBtn.disabled = !!why;
    select.disabled = !!why;
    offBtn.hidden = true;
    if (why) { status.textContent = why; return; }
    try { show(await currentSubscription()); } catch (e) { show(null); }
  }

  async function enable() {
    const hour = Number(select.value);
    onBtn.disabled = true;
    status.textContent = '設定中…';
    let created = null;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        status.textContent = perm === 'denied'
          ? '你拒絕了通知權限。之後想開啟，要到瀏覽器的網站設定裡允許通知。'
          : '還沒允許通知，所以沒有開啟提醒。';
        return;
      }
      // 本機預覽平常不註冊 Service Worker（見 app.js），開啟提醒時才註冊
      await navigator.serviceWorker.register('sw.js');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = created = await reg.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
        });
      }
      await post('/subscribe', { app: APP, hour, subscription: sub.toJSON() });
      saveHour(hour);
      show(sub);
      status.textContent += ' 剛剛應該已收到一則確認通知。';
    } catch (e) {
      console.error('開啟提醒失敗', e);
      // 伺服器沒記到的話，瀏覽器這邊也不要留著訂閱，免得畫面顯示「已開啟」卻永遠收不到
      if (created) await created.unsubscribe().catch(() => {});
      status.textContent = '沒有開啟成功：連不上提醒伺服器或瀏覽器拒絕了訂閱，請稍後再試。';
    } finally {
      onBtn.disabled = false;
    }
  }

  async function disable() {
    offBtn.disabled = true;
    try {
      const sub = await currentSubscription();
      if (sub) {
        // 先請伺服器刪除；就算連不上，瀏覽器端取消後伺服器下次送信會收到 410 而自動刪掉
        await post('/unsubscribe', { app: APP, endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      saveHour(null);
      show(null);
      status.textContent = '已取消提醒。';
    } catch (e) {
      status.textContent = '取消失敗，請再試一次。';
    } finally {
      offBtn.disabled = false;
    }
  }

  function open() { sheet.hidden = false; refresh(); $('remind-close').focus(); }
  function close() { sheet.hidden = true; $('remind').focus(); }

  $('remind').addEventListener('click', open);
  $('remind-close').addEventListener('click', close);
  onBtn.addEventListener('click', enable);
  offBtn.addEventListener('click', disable);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });
})();
