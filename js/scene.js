// 水墨山水場景：依 data/scenes.json 的範本，把 assets/landscape 的單色 SVG 上色後合成。
// 規格見「水墨日曆 App 設計/design-return/NOTES.md」。流程分兩段：
//   prepare()：挑範本、抽亂數、載入並上色所有素材（非同步）
//   draw()：   依山水區上緣 top 把素材畫上去（同步，螢幕與匯出共用）
(function (global) {
  const W = 1080, H = 1920;
  const SEASON_COLOR = { spring: '#4E6C58', summer: '#3A5868', autumn: '#765C42', winter: '#2A2E30' };
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const TONE = { far: 0.75, mid: 0.45, near: 0.15 };
  const DUSK_CHANCE = 0.3; // 淺色主題時，範本同時支援日與夕照的話，抽到夕照的機率
  const SEAL = { file: 'assets/seal/chosen.svg', svgColor: '#A93A2E' }; // 落款章：這裡只負責載入與上色，由 card.js 蓋在出處旁

  const seasonOf = (m) => ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][m - 1];
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const B = hex(b); return toHex(hex(a).map((v, i) => Math.round(v + (B[i] - v) * t))); };
  const rgba = (h, a) => { const c = hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  const pick = (v, r) => (Array.isArray(v) ? v[0] + (v[1] - v[0]) * r() : v);

  let scenes = null;
  async function load() {
    if (scenes) return scenes;
    const r = await fetch('data/scenes.json');
    if (!r.ok) throw new Error('scenes.json 載入失敗');
    scenes = await r.json();
    return scenes;
  }

  // ---- 素材：抓一次原始 SVG，依（檔案, 顏色）上色後快取成 Image ----
  const texts = new Map();
  const images = new Map();

  function svgText(path) {
    if (!texts.has(path)) {
      texts.set(path, fetch(path).then((r) => {
        if (!r.ok) throw new Error(path + ' 載入失敗');
        return r.text();
      }));
    }
    return texts.get(path);
  }

  // 把 from 色換成 to 色，但遮罩（<mask>）裡的黑白是透明度的意思，不能動
  function recolor(svg, from, to) {
    const re = new RegExp(`<mask[\\s\\S]*?</mask>|"${from}"`, 'g');
    return svg.replace(re, (m) => (m.startsWith('<mask') ? m : `"${to}"`));
  }

  function image(path, from, to) {
    const key = `${path}|${to || ''}`;
    if (!images.has(key)) {
      images.set(key, (async () => {
        let s = await svgText(path);
        const anchor = (s.match(/data-anchor="(\w+)"/) || [0, 'center'])[1];
        if (to) s = recolor(s, from, to);
        const img = new Image();
        img.src = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
        await img.decode();
        return { img, anchor, ratio: (img.naturalHeight || img.height) / (img.naturalWidth || img.width) };
      })());
    }
    return images.get(key);
  }

  // ---- 挑範本：同一季的候選範本打散成固定順序，逐日輪替，連續兩天不會重複 ----
  function choose(info, dark) {
    const season = seasonOf(info.month);
    const list = scenes.filter((s) => s.seasons.includes(season)
      && (dark ? s.time.includes('night') : s.time.some((t) => t !== 'night')));
    const order = list.slice();
    const r = global.InkScape.rng(97 + SEASONS.indexOf(season) * 13);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const dayIndex = Math.floor(Date.UTC(info.year, info.month - 1, info.day) / 86400000);
    const scene = order[dayIndex % order.length];

    let time = 'night';
    if (!dark) {
      const opts = scene.time.filter((t) => t !== 'night');
      time = opts.length > 1 ? (global.InkScape.rng(dayIndex * 7 + 3)() < DUSK_CHANCE ? 'dusk' : 'day') : opts[0];
    }
    return { scene, time, season };
  }

  /**
   * @param info    LunarInfo.info() 的結果
   * @param c       色票 {paper, ink, seal, sun, dark}
   * @returns       交給 draw() 的資料；失敗時丟出錯誤，由呼叫端改用程序化山水
   */
  async function prepare(info, c) {
    await load();
    const { scene, time, season } = choose(info, c.dark);
    const tint = SEASON_COLOR[season];
    const vermilionTaken = !!(info.jieqi || info.festivals.length); // 節日／節氣框已用掉一處朱紅
    const rand = global.InkScape.rng((info.year * 10000 + info.month * 100 + info.day) * 31 + 7);

    const xs = [];
    const jobs = [];
    for (const L of scene.layers) {
      // 每個圖層都依序抽 x、y、scale、flip；被 only 跳過的也要抽，讓同一天不同時段的景物位置一致
      const x = L.xFrom != null ? xs[L.xFrom] : pick(L.x, rand);
      xs.push(x);
      const y = pick(L.y, rand);
      const scale = pick(L.scale ?? 1, rand);
      const flip = L.flip === 'random' ? rand() < 0.5 : !!L.flip;
      if (L.only && L.only !== time) continue;

      let name = L.asset;
      let opacity = L.opacity ?? 1;
      if (name === 'sun-01-red' && vermilionTaken) { name = 'sun-01'; opacity *= 0.35; }

      let color;
      if (name.endsWith('-red')) color = null;
      else if (L.role === 'mist') color = c.paper;
      else if (L.color === 'sun') color = c.sun;
      else color = mix(c.ink, tint, TONE[L.tone || 'mid'] * (c.dark ? 0.5 : 1));

      jobs.push(image(`assets/landscape/${name}.svg`, '#000', color)
        .then((a) => ({ ...a, x, y, w: L.width * scale, flip, opacity })));
    }
    const sealColor = c.seal.toUpperCase() === SEAL.svgColor ? null : c.seal;
    const [layers, seal] = await Promise.all([
      Promise.all(jobs),
      image(SEAL.file, SEAL.svgColor, sealColor),
    ]);
    return { id: scene.id, name: scene.name, time, dusk: time === 'dusk' && !c.dark, layers, seal, sun: c.sun };
  }

  function draw(ctx, prep, top) {
    const span = H - top;
    if (prep.dusk) {
      const g = ctx.createLinearGradient(0, top - 80, 0, top + span * 0.6);
      g.addColorStop(0, rgba(prep.sun, 0));
      g.addColorStop(0.35, rgba(prep.sun, 0.07));
      g.addColorStop(1, rgba(prep.sun, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, top - 80, W, span * 0.6 + 80);
    }
    for (const L of prep.layers) {
      const w = L.w * W, h = w * L.ratio;
      ctx.save();
      ctx.globalAlpha = L.opacity;
      ctx.translate(L.x * W, top + L.y * span);
      if (L.flip) ctx.scale(-1, 1);
      ctx.drawImage(L.img, -w / 2, L.anchor === 'bottom' ? -h : -h / 2, w, h);
      ctx.restore();
    }
  }

  global.Scene = { prepare, draw, seasonOf };
})(window);
