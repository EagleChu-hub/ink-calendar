(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $('card');
  const stage = $('stage');
  const pad = LunarInfo.pad;

  const months = {}; // 'YYYY-MM' → 該月內容（載入中為 Promise）
  let current = startDate();

  function startDate() {
    const m = /^#(\d{4})(\d{2})(\d{2})$/.exec(location.hash);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      paper: v('--paper'), ink: v('--ink'), inkSoft: v('--ink-soft'), seal: v('--seal'),
      sealText: v('--seal-text'), sun: v('--sun'),
      dark: cs.getPropertyValue('color-scheme').includes('dark'),
    };
  }

  const monthOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const keyOf = (d) => `${monthOf(d)}-${pad(d.getDate())}`;
  const entryOf = (d) => {
    const m = months[monthOf(d)];
    return (m && !(m instanceof Promise) && m[keyOf(d)]) || null;
  };

  function loadMonth(d) {
    const k = monthOf(d);
    if (!months[k]) {
      months[k] = loadJSON(`data/quotes/${k}.json`).then((data) => (months[k] = data || {}));
    }
    return Promise.resolve(months[k]);
  }

  let scene = null; // 目前這一天、這個主題的山水場景（Scene.prepare 的結果）

  function draw(ctx, scale) {
    const info = LunarInfo.info(current);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    Card.render(ctx, entryOf(current), info, palette(), scene);
  }

  async function prepareScene(info) {
    try {
      return await Scene.prepare(info, palette());
    } catch (e) {
      console.warn('山水素材載入失敗，改用程序化山水', e);
      return null;
    }
  }

  function layout() {
    const r = stage.getBoundingClientRect();
    const h = Math.max(200, Math.min(r.height, r.width * 16 / 9));
    const w = h * 9 / 16;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  let renderToken = 0;
  async function render() {
    const token = ++renderToken;
    await loadMonth(current);
    if (token !== renderToken) return;
    const info = LunarInfo.info(current);
    const entry = entryOf(current);
    $('date-label').textContent = `${info.year}/${pad(info.month)}/${pad(info.day)}`;
    $('date-input').value = `${info.year}-${pad(info.month)}-${pad(info.day)}`;
    $('card-text').textContent = entry
      ? `${info.year}年${info.monthName}${info.day}日 ${info.week}，農曆${info.lunarDate}。${entry.title}：「${entry.quote}」── ${entry.source}。${entry.text}`
      : `${info.year}年${info.monthName}${info.day}日 ${info.week}，農曆${info.lunarDate}。`;

    // 等待這張卡用到的字形與山水素材都載入後再畫，避免先以後備字型閃一下
    const scenePromise = prepareScene(info);
    try {
      await Promise.race([
        Promise.all(Card.fontsFor(entry || { title: '', quote: '今日留白', text: '這一天的短文還在研墨中。留一點空白給自己，也是一種功課。', source: '' }, info)),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    } catch (e) { /* 字型載入失敗時用後備字型 */ }
    const prepared = await scenePromise;
    if (token !== renderToken) return;
    scene = prepared;
    draw(canvas.getContext('2d'), canvas.width / Card.W);
    canvas.classList.remove('fading');
    document.documentElement.dataset.rendered = keyOf(current); // 給 tools/build_share.py 判斷這一天畫完了
  }

  function go(days) {
    current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + days);
    canvas.classList.add('fading');
    render();
  }

  $('prev').addEventListener('click', () => go(-1));
  $('next').addEventListener('click', () => go(1));
  $('today').addEventListener('click', () => {
    const now = new Date();
    current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    render();
  });
  $('date-input').addEventListener('change', (e) => {
    const [y, m, d] = e.target.value.split('-').map(Number);
    if (y && m && d) { current = new Date(y, m - 1, d); render(); }
  });
  // 網址的 #YYYYMMDD 改變時換到那一天（點推播通知、分享連結時會用到）
  window.addEventListener('hashchange', () => { current = startDate(); render(); });
  document.addEventListener('keydown', (e) => {
    if (!$('sheet').hidden || !$('about-sheet').hidden || !$('remind-sheet').hidden || e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  });

  // 左右滑動換日
  let touchX = null, touchY = null;
  stage.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    touchX = null;
  });

  $('save').addEventListener('click', async () => {
    const btn = $('save');
    const label = btn.innerHTML; // 按鈕裡有分享圖示，不能只存文字
    btn.disabled = true;
    btn.textContent = '產生中…';
    try {
      const blob = await CardExport.makeImage((ctx) => draw(ctx, 1));
      const i = LunarInfo.info(current);
      CardExport.openSheet(blob, `水墨日曆-${i.year}${pad(i.month)}${pad(i.day)}.png`, shareInfo(i));
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });

  // 分享到 Threads、LINE 的文字與連結。有內容的日子連到 d/YYYYMMDD.html：
  // 那是 tools/build_share.py 產生的靜態頁，帶有這一天的預覽圖，打開後會自動跳回日曆的這一天。
  function shareInfo(i) {
    const e = entryOf(current);
    const ymd = `${i.year}${pad(i.month)}${pad(i.day)}`;
    const base = `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;
    const url = e ? `${base}d/${ymd}.html` : `${base}#${ymd}`;
    if (!e) return { text: '水墨日曆', url };
    return { text: `${e.title ? e.title + '｜' : ''}${e.quote}${e.source ? '── ' + e.source : ''}`, url };
  }

  // 關於與授權
  const aboutSheet = $('about-sheet');
  const closeAbout = () => { aboutSheet.hidden = true; $('about').focus(); };
  $('about').addEventListener('click', () => { aboutSheet.hidden = false; $('about-close').focus(); });
  $('about-close').addEventListener('click', closeAbout);
  aboutSheet.addEventListener('click', (e) => { if (e.target === aboutSheet) closeAbout(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !aboutSheet.hidden) closeAbout(); });

  // 主題切換（系統深淺色或 data-theme）時重畫
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { layout(); render(); }, 120);
  });

  // 跨日時自動換到新的一天（App 一直開著的情況）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (+today !== +current && Math.abs(today - current) <= 86400000 * 2) { current = today; render(); }
  });

  async function loadJSON(url) {
    try {
      const r = await fetch(url);
      return r.ok ? r.json() : null;
    } catch (e) { return null; }
  }

  (async function init() {
    layout();
    const f = await loadJSON('data/festivals-tw.json');
    if (f) LunarInfo.setFestivals(f);
    await render();
  })();

  // 本機開發時不啟用離線快取，避免改了程式卻一直看到舊版
  if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* Artifact 等不支援的環境略過 */ });
  }
})();
