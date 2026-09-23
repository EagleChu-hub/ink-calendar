// 程序化水墨山水：以日期為種子，每天畫出不同的遠山、霧、日（夜間為月）、飛鳥。
// 所有座標以 1080×1920 為基準，呼叫前請先 ctx.scale。
(function (global) {
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 四季設色：春石綠、夏石青、秋赭石、冬純墨
  const SEASON = [
    [42, 46, 48], [42, 46, 48], [78, 108, 88], [78, 108, 88], [78, 108, 88], [58, 88, 104],
    [58, 88, 104], [58, 88, 104], [118, 92, 66], [118, 92, 66], [118, 92, 66], [42, 46, 48],
  ];

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

  // 中點位移產生山稜線
  function ridge(rand, width, baseY, amp, rough, peaks) {
    const n = 129;
    const ys = new Array(n).fill(0);
    ys[0] = (rand() - 0.5) * amp;
    ys[n - 1] = (rand() - 0.5) * amp;
    let step = n - 1, a = amp;
    while (step > 1) {
      const half = step / 2;
      for (let i = half; i < n; i += step) {
        ys[i] = (ys[i - half] + ys[i + half]) / 2 + (rand() - 0.5) * a;
      }
      step = half;
      a *= rough;
    }
    // 疊上幾座主峰，讓輪廓有山的樣子而不只是雜訊
    for (let k = 0; k < peaks; k++) {
      const cx = rand() * n, w = n * (0.08 + rand() * 0.18), h = amp * (0.6 + rand() * 0.9);
      for (let i = 0; i < n; i++) ys[i] -= h * Math.exp(-((i - cx) ** 2) / (2 * w * w));
    }
    return ys.map((y, i) => [(i / (n - 1)) * (width + 40) - 20, baseY + y]);
  }

  // 山頭不得高過 limit（避免壓到文字）：超過時等比例壓低整條稜線的起伏
  function clampRidge(pts, baseY, limit) {
    const minY = Math.min(...pts.map((p) => p[1]));
    if (minY >= limit) return pts;
    const k = (baseY - limit) / (baseY - minY);
    return pts.map(([x, y]) => [x, baseY + (y - baseY) * k]);
  }

  function drawRidge(ctx, pts, color, alpha, depth, H) {
    const top = Math.min(...pts.map((p) => p[1]));
    // 墨從稜線往下暈開：多層疊染，每層略微下移並變淡，模擬筆墨滲開的邊緣
    for (let pass = 0; pass < 4; pass++) {
      const off = pass * 3;
      const g = ctx.createLinearGradient(0, top + off, 0, top + off + depth);
      g.addColorStop(0, rgba(color, alpha * (1 - pass * 0.22)));
      g.addColorStop(0.35, rgba(color, alpha * 0.55 * (1 - pass * 0.22)));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], H + 10);
      for (const [x, y] of pts) ctx.lineTo(x, y + off);
      ctx.lineTo(pts[pts.length - 1][0], H + 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  function mist(ctx, y, h, W, paper, alpha) {
    const g = ctx.createLinearGradient(0, y - h, 0, y + h);
    g.addColorStop(0, rgba(paper, 0));
    g.addColorStop(0.5, rgba(paper, alpha));
    g.addColorStop(1, rgba(paper, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, y - h, W, h * 2);
  }

  function bird(ctx, x, y, s, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s, y - s * 0.35);
    ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.55, x, y);
    ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.6, x + s * 1.05, y - s * 0.3);
    ctx.stroke();
  }

  // 宣紙底色與紋理：極淡的纖維點與短絲
  function paper(ctx, W, H, o, rand = rng(o.seed)) {
    const ink = hexToRgb(o.ink);
    ctx.fillStyle = o.paper;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      const x = rand() * W, y = rand() * H;
      ctx.fillStyle = rgba(ink, 0.012 + rand() * 0.03);
      if (rand() < 0.85) ctx.fillRect(x, y, 1.6, 1.6);
      else ctx.fillRect(x, y, 6 + rand() * 14, 1);
    }
  }

  /**
   * 程序化山水：美術素材載入失敗時的備援
   * @param {CanvasRenderingContext2D} ctx
   * @param {{seed:number, month:number, dark:boolean, paper:string, ink:string, sun:string, top:number}} o
   *   top：山景最高可到的 y（1920 座標）
   */
  function draw(ctx, W, H, o) {
    const rand = rng(o.seed);
    const paperRgb = hexToRgb(o.paper);
    const ink = hexToRgb(o.ink);
    const tint = SEASON[o.month - 1];

    paper(ctx, W, H, o, rand);

    const top = o.top;
    const span = H - top;

    // 日（夜為月）
    const sx = W * (rand() < 0.5 ? 0.2 + rand() * 0.15 : 0.65 + rand() * 0.15);
    const sy = top + span * (0.08 + rand() * 0.06);
    const sr = 46 + rand() * 18;
    const sun = hexToRgb(o.sun);
    const sg = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 1.02);
    sg.addColorStop(0, rgba(sun, o.dark ? 0.85 : 0.62));
    sg.addColorStop(0.92, rgba(sun, o.dark ? 0.7 : 0.5));
    sg.addColorStop(1, rgba(sun, 0));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, sr * 1.02, 0, Math.PI * 2);
    ctx.fill();

    // 由遠至近四層山：愈遠愈淡、愈偏季節色
    const layers = [
      { base: 0.34, amp: 150, rough: 0.56, peaks: 2, alpha: o.dark ? 0.2 : 0.14, t: 0.75, depth: 180 },
      { base: 0.52, amp: 170, rough: 0.54, peaks: 2, alpha: o.dark ? 0.3 : 0.24, t: 0.55, depth: 200 },
      { base: 0.72, amp: 190, rough: 0.52, peaks: 2, alpha: o.dark ? 0.42 : 0.4, t: 0.35, depth: 240 },
      { base: 0.93, amp: 150, rough: 0.5, peaks: 1, alpha: o.dark ? 0.55 : 0.62, t: 0.15, depth: 260 },
    ];
    for (const L of layers) {
      const baseY = top + span * L.base;
      const color = mix(ink, tint, L.t);
      const pts = clampRidge(ridge(rand, W, baseY, L.amp, L.rough, L.peaks), baseY, top);
      drawRidge(ctx, pts, color, L.alpha, L.depth, H);
      mist(ctx, baseY + 70, 60 + rand() * 30, W, paperRgb, 0.55);
    }

    // 飛鳥 0–3 隻
    const nb = Math.floor(rand() * 4);
    const bx = W * (0.3 + rand() * 0.4), by = top + span * (0.06 + rand() * 0.08);
    for (let i = 0; i < nb; i++) {
      bird(ctx, bx + i * (34 + rand() * 20), by + (rand() - 0.5) * 36, 11 + rand() * 6, rgba(ink, 0.55));
    }
  }

  global.InkScape = { draw, paper, rng };
})(window);
