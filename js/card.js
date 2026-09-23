// 以 Canvas 繪製整張 9:16 日曆卡。螢幕顯示與匯出圖卡共用同一份繪製程式，確保兩者一模一樣。
// 基準座標 1080×1920。
(function (global) {
  const W = 1080, H = 1920, M = 88;
  const TITLE_SEAL = 104; // 題字方印（引首章）；比山水角落的篆書落款章大，主次分明
  const DISPLAY = '"LXGW WenKai TC", "Kaiti TC", "BiauKai", "DFKai-SB", serif';
  const BODY = '"Noto Serif TC", "Songti TC", "PMingLiU", serif';
  const NO_LINE_START = '，。、；：！？」』）…—';
  const CN_DIGIT = '〇一二三四五六七八九';

  const cnYear = (y) => String(y).split('').map((d) => CN_DIGIT[d]).join('');

  function fontsFor(entry, info) {
    const all = [entry.title, entry.quote, entry.text, entry.source, info.monthName, info.week,
      info.lunarDate, info.jieqi, info.festivals.join(''), info.ganzhiYear, cnYear(info.year), '農曆0123456789'].join('');
    return [
      `400 60px ${DISPLAY}`, `700 60px ${DISPLAY}`, `300 60px ${BODY}`, `400 60px ${BODY}`,
    ].map((f) => document.fonts.load(f, all));
  }

  // 把原文切成直書的行：一個子句一行，超過 9 字的子句再均分。
  // 回傳 [{text, stops}]，stops 是行內子句結束處的字序（要畫句讀圈點的位置）。
  function columns(quote) {
    const pieces = []; // {text, end, sentence}：end 表示這段是子句結尾；sentence 是所屬整句（以 。；！？ 為界）的編號
    quote.split(/[。；！？.;!?]+/).filter((x) => x.trim()).forEach((sentence, si) => {
      for (const p of sentence.split(/[，、：,:\s]+/).filter(Boolean)) {
        if (p.length <= 9) { pieces.push({ text: p, end: true, sentence: si }); continue; }
        const n = Math.ceil(p.length / 9), size = Math.ceil(p.length / n);
        for (let i = 0; i < p.length; i += size) {
          pieces.push({ text: p.slice(i, i + size), end: i + size >= p.length, sentence: si });
        }
      }
    });
    if (pieces.length <= 5) return pieces.map((c) => ({ text: c.text, stops: [] }));
    // 行數太多時字會太小：同一句裡相鄰的子句併成一行（每行最多 8 字），不跨句合併
    const merged = [];
    for (const c of pieces) {
      const last = merged[merged.length - 1];
      if (last && last.sentence === c.sentence && last.text.length + c.text.length <= 8) {
        if (last.end) last.stops.push(last.text.length - 1);
        last.text += c.text;
        last.end = c.end;
      } else {
        merged.push({ text: c.text, stops: [], end: c.end, sentence: c.sentence });
      }
    }
    return merged;
  }

  function wrap(ctx, text, maxW) {
    const lines = [];
    let line = '';
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW && line && !NO_LINE_START.includes(ch)) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function seal(ctx, x, y, s, title, c, seed) {
    const rand = global.InkScape.rng(seed * 7 + 3);
    ctx.save();
    ctx.fillStyle = c.seal;
    ctx.globalAlpha = 0.92;
    // 印邊略不規則
    ctx.beginPath();
    const j = () => (rand() - 0.5) * 5;
    ctx.moveTo(x + j(), y + j());
    ctx.lineTo(x + s + j(), y + j());
    ctx.lineTo(x + s + j(), y + s + j());
    ctx.lineTo(x + j(), y + s + j());
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // 印文：配合卡片上的橫書，先由左到右、再由上到下（朱文底、留白字）
    const chars = [...title];
    const fs = s * 0.37;
    ctx.fillStyle = c.sealText;
    ctx.font = `700 ${fs}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pos = [[0.28, 0.29], [0.72, 0.29], [0.28, 0.72], [0.72, 0.72]];
    chars.slice(0, 4).forEach((ch, i) => ctx.fillText(ch, x + s * pos[i][0], y + s * pos[i][1]));
    // 蓋印時的斑駁留白
    ctx.fillStyle = c.paper;
    for (let i = 0; i < 70; i++) {
      ctx.globalAlpha = 0.25 + rand() * 0.5;
      ctx.fillRect(x + rand() * s, y + rand() * s, 1 + rand() * 3, 1 + rand() * 2.5);
    }
    ctx.restore();
  }

  function chip(ctx, x, y, label, c) {
    ctx.font = `400 34px ${DISPLAY}`;
    const w = ctx.measureText(label).width + 36;
    ctx.strokeStyle = c.seal;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, 54, 4) : ctx.rect(x, y, w, 54);
    ctx.stroke();
    ctx.fillStyle = c.seal;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 18, y + 28);
    return w;
  }

  /**
   * @param ctx 已 scale 至 1080×1920 座標的 context
   * @param entry {title, quote, source, text} 或 null（尚無內容）
   * @param info  LunarInfo.info() 的結果
   * @param c     色票 {paper, ink, inkSoft, seal, sealText, sun, dark}
   * @param scene Scene.prepare() 的結果；null 時改畫程序化山水
   */
  function render(ctx, entry, info, c, scene = null) {
    const blank = !entry;
    entry = entry || { title: '', quote: '今日留白', source: '', text: '這一天的短文還在研墨中。留一點空白給自己，也是一種功課。' };
    const seed = info.year * 10000 + info.month * 100 + info.day;

    // 先排版文字，得知山景可以從哪裡開始
    ctx.font = `400 40px ${BODY}`;
    const bodyLines = wrap(ctx, entry.text, W - M * 2);
    const bodyTop = 1000, lh = 74;
    const bodyEnd = bodyTop + bodyLines.length * lh;
    const sourceY = bodyEnd + 40;
    const inkTop = Math.max(sourceY + 90, 1270);

    const bg = { seed, month: info.month, dark: c.dark, paper: c.paper, ink: c.ink, sun: c.sun, top: inkTop };
    if (scene) {
      global.InkScape.paper(ctx, W, H, bg);
      global.Scene.draw(ctx, scene, inkTop);
    } else {
      global.InkScape.draw(ctx, W, H, bg);
    }

    ctx.textBaseline = 'alphabetic';

    // 年
    ctx.fillStyle = c.inkSoft;
    ctx.font = `400 32px ${BODY}`;
    ctx.textAlign = 'left';
    ctx.fillText(cnYear(info.year), M, 150);
    ctx.textAlign = 'right';
    ctx.fillText(info.ganzhiYear, W - M, 150);

    // 細線
    ctx.strokeStyle = c.inkSoft;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(M, 184);
    ctx.lineTo(W - M, 184);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 左欄：月、日、星期、農曆、節氣節日
    ctx.textAlign = 'left';
    ctx.fillStyle = c.ink;
    ctx.font = `400 50px ${DISPLAY}`;
    ctx.fillText(info.monthName, M, 290);
    ctx.font = `300 290px ${BODY}`;
    const dayRight = M - 12 + ctx.measureText(LunarInfo.pad(info.day)).width;
    ctx.fillText(LunarInfo.pad(info.day), M - 12, 560);
    ctx.font = `400 40px ${DISPLAY}`;
    ctx.fillText(info.week, M, 640);
    ctx.fillStyle = c.inkSoft;
    ctx.font = `400 34px ${BODY}`;
    ctx.fillText('農曆' + info.lunarDate, M, 700);

    let cx = M;
    for (const label of [info.jieqi, ...info.festivals].filter(Boolean)) {
      cx += chip(ctx, cx, 732, label, c) + 16;
    }

    // 右欄：直書原文，由右至左。
    // 題字方印當作「引首章」蓋在第一行正上方：看完日期後，紅印把視線帶到原文的起點（最右一行）
    const cols = columns(entry.quote);
    const areaL = 530, areaR = W - M, areaB = 920;
    const areaT = entry.title ? 222 + TITLE_SEAL + 30 : 240;
    const maxLen = Math.max(...cols.map((col) => col.text.length));
    // 字級上限：一行的短句 110、兩行以上 96；再依原文區的寬高縮小
    const fs = Math.min(cols.length <= 1 ? 110 : 96, (areaR - areaL) / (cols.length * 1.5), (areaB - areaT) / (maxLen * 1.12));
    const colW = fs * 1.5;
    // 行數少時，原文塊置中在「日期右緣到右邊界」的空白裡；行數多時自然填滿，仍靠右
    const spaceL = Math.min(areaL, dayRight + 70);
    const right = areaR - Math.max(0, (areaR - spaceL - cols.length * colW) / 2);
    if (entry.title) {
      const sx = Math.min(right - colW / 2 - TITLE_SEAL / 2, W - M - TITLE_SEAL); // 方印對齊第一行
      seal(ctx, sx, 222, TITLE_SEAL, entry.title, c, seed);
    }
    ctx.font = `400 ${fs}px ${DISPLAY}`;
    ctx.fillStyle = blank ? c.inkSoft : c.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    cols.forEach((col, i) => {
      const x = right - colW * (i + 0.5);
      [...col.text].forEach((ch, k) => ctx.fillText(ch, x, areaT + fs * 1.12 * (k + 0.5)));
    });

    // 句讀圈點：合併成一行的句子之間，在前一句末字的右下角畫一個淡墨小圈，像古書的圈點
    ctx.strokeStyle = c.inkSoft;
    ctx.lineWidth = Math.max(1.5, fs * 0.035);
    cols.forEach((col, i) => {
      const x = right - colW * (i + 0.5);
      for (const k of col.stops) {
        ctx.beginPath();
        ctx.arc(x + fs * 0.5, areaT + fs * 1.12 * (k + 0.5) + fs * 0.4, fs * 0.08, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // 白話短文
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = c.ink;
    ctx.font = `400 40px ${BODY}`;
    bodyLines.forEach((ln, i) => ctx.fillText(ln, M, bodyTop + 40 + i * lh));

    // 出處，後面接著蓋篆書落款章（像書畫題款後的名章）
    let sourceRight = W - M;
    if (scene && scene.seal) {
      const w = 64, h = w * scene.seal.ratio;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.drawImage(scene.seal.img, W - M - w, sourceY + 29 - h / 2, w, h);
      ctx.restore();
      sourceRight = W - M - w - 20;
    }
    if (entry.source) {
      ctx.textAlign = 'right';
      ctx.fillStyle = c.inkSoft;
      ctx.font = `400 32px ${DISPLAY}`;
      ctx.fillText('── ' + entry.source, sourceRight, sourceY + 40);
    }
  }

  global.Card = { W, H, render, fontsFor };
})(window);
