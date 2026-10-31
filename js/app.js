(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $('card');
  const stage = $('stage');
  const pad = LunarInfo.pad;

  const months = {}; // 'YYYY-MM' → 該月內容（載入中為 Promise）
  let current = startDate();
  let retry = false; // 這一天的內容因為斷線沒載到
  // 斷線時圖卡上顯示的內容（不是「今日留白」，免得以為這天沒有內容）
  const OFFLINE = { title: '', quote: '連線中斷', source: '', text: '這一天的內容沒有載入成功。網路恢復後，會自動再試一次。', blank: true };
  const shown = () => entryOf(current) || (retry ? OFFLINE : null);

  function startDate() {
    const m = /^#(\d{4})(\d{2})(\d{2})$/.exec(location.hash);
    if (m) {
      // 讀完就把 #日期 拿掉：之後重新整理、或過幾天分頁被瀏覽器重新載入，都會回到今天
      history.replaceState(null, '', location.pathname + location.search);
      return new Date(+m[1], +m[2] - 1, +m[3]);
    }
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
      // 只有「沒有這個月的檔案」（收錄範圍外）才當成空的；斷線抓不到就不要記住，下次換日或連上網路時再試
      months[k] = fetch(`data/quotes/${k}.json`)
        .then((r) => {
          if (r.ok) return r.json();
          if (r.status === 404) return {};
          throw new Error(`data/quotes/${k}.json ${r.status}`);
        })
        .then((data) => (months[k] = data), (e) => { delete months[k]; throw e; });
    }
    return Promise.resolve(months[k]);
  }

  let scene = null; // 目前這一天、這個主題的山水場景（Scene.prepare 的結果）

  function draw(ctx, scale) {
    const info = LunarInfo.info(current);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    Card.render(ctx, shown(), info, palette(), scene);
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
    let failed = false;
    try { await loadMonth(current); } catch (e) { failed = true; }
    if (token !== renderToken) return;
    retry = failed;
    const info = LunarInfo.info(current);
    const entry = shown();
    $('date-label').textContent = `${info.year}/${pad(info.month)}/${pad(info.day)}`;
    $('date-input').value = `${info.year}-${pad(info.month)}-${pad(info.day)}`;
    $('card-text').textContent = entry && !entry.blank
      ? `${info.year}年${info.monthName}${info.day}日 ${info.week}，農曆${info.lunarDate}。${entry.title}：「${entry.quote}」── ${entry.source}。${entry.text}`
      : `${info.year}年${info.monthName}${info.day}日 ${info.week}，農曆${info.lunarDate}。${entry ? entry.text : ''}`;

    // 等待這張卡用到的字形與山水素材都載入後再畫，避免先以後備字型閃一下
    const scenePromise = prepareScene(info);
    const fontsReady = Promise.all(Card.fontsFor(entry || { title: '', quote: '今日留白', text: '這一天的短文還在研墨中。留一點空白給自己，也是一種功課。', source: '' }, info));
    let fontsLate = true;
    try {
      await Promise.race([
        fontsReady.then(() => { fontsLate = false; }),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    } catch (e) { /* 字型載入失敗時用後備字型 */ }
    const prepared = await scenePromise;
    if (token !== renderToken) return;
    scene = prepared;
    draw(canvas.getContext('2d'), canvas.width / Card.W);
    canvas.classList.remove('fading');
    document.documentElement.dataset.rendered = keyOf(current); // 給 tools/build_share.py 判斷這一天畫完了
    // 字型超過 2.5 秒才到的話，剛才是用後備字型畫的；字型到了再重畫一次
    if (fontsLate) fontsReady.then(() => { if (token === renderToken) draw(canvas.getContext('2d'), canvas.width / Card.W); }, () => {});
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
  // 電腦版：點日期直接打開日曆（Chrome 點到輸入框本身只會選到年月日其中一格，不會跳出日曆）
  $('date-input').addEventListener('click', (e) => {
    if (!matchMedia('(pointer: fine)').matches || !e.target.showPicker) return;
    try { e.target.showPicker(); } catch (err) { /* 不支援時維持原本行為 */ }
  });
  // 剛才斷線沒載到內容的話，連上網路就自動再畫一次
  window.addEventListener('online', () => { if (retry) render(); });
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
      CardExport.openSheet(blob, `水墨日曆-${i.year}${pad(i.month)}${pad(i.day)}`, shareInfo(i));
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
  $('about').addEventListener('click', () => {
    aboutSheet.hidden = false;
    // 焦點放在最下面的「關閉」，但畫面停在最上面，標題和收錄範圍才看得到
    aboutSheet.querySelector('.sheet-inner').scrollTop = 0;
    $('about-close').focus({ preventScroll: true });
  });
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
