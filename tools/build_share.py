"""
產生每一天的分享頁與預覽圖，讓 Threads、LINE 貼連結時顯示「這一天」的縮圖。

  d/YYYYMMDD.html   靜態分享頁：帶這一天的 og 標籤，打開後自動跳回日曆的 #YYYYMMDD
  og/YYYYMMDD.jpg   1200×630 預覽圖：左邊是日期與句子，右邊是這一天的圖卡

為什麼要這樣做：Threads、LINE 抓預覽圖時不會執行網頁程式，也收不到網址 # 後面的日期，
所以只看 index.html 的話，每天都會是同一張圖。

用法（需要 Playwright 與本機 Chrome；空鏡日曆也有同一支工具）：
  python tools/build_share.py            全部重新產生（每天約 1 秒）
  python tools/build_share.py 2026-09    只產生某個月（或某一天 2026-09-25）
  python tools/build_share.py --check    只檢查：每一天都有分享頁和預覽圖，而且內容跟目前的語錄一致
改了語錄之後要重跑，再用 --check 確認沒有漏。
"""
import base64
import datetime
import html
import io
import json
import re
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://eaglechu-hub.github.io/ink-calendar/'
NAME = '水墨日曆'
PORT = 8792
COLORS = dict(bg='#DCDFD8', text='#1C2022', soft='#5F6763', accent='#A93A2E')
FONT_BOLD = 'C:/Windows/Fonts/kaiu.ttf'   # 標楷體：接近卡片上的霞鶩文楷
FONT = 'C:/Windows/Fonts/mingliu.ttc'
WEEK = '一二三四五六日'


def source_line(e):
    return f"── {e['source']}"


def quote_of(e):
    return e['quote']


def description(e):
    """跟 js/app.js 的 shareInfo 一樣：標題｜原文── 出處"""
    return f"{e['title']}｜{e['quote']}── {e['source']}"


# ── 共用 ──
def load_entries():
    out = {}
    for f in sorted((ROOT / 'data/quotes').glob('*.json')):
        out.update(json.loads(f.read_text(encoding='utf-8')))
    return dict(sorted(out.items()))


def ymd(key):
    return key.replace('-', '')


NO_LINE_START = set('，。、；：！？」』）…—')


def wrap(draw, text, font, width):
    """依寬度換行；標點不放行首，改成把前面的字一起帶到下一行（不會凸出去）"""
    lines, cur = [], ''
    for ch in text:
        if draw.textlength(cur + ch, font=font) <= width or not cur:
            cur += ch
            continue
        cut = len(cur)
        while cut > 1 and (ch if cut == len(cur) else cur[cut]) in NO_LINE_START:
            cut -= 1
        lines.append(cur[:cut])
        cur = cur[cut:] + ch
    if cur:
        lines.append(cur)
    return lines


def compose(card_png, key, e):
    W, H = 1200, 630
    c = COLORS
    im = Image.new('RGB', (W, H), c['bg'])
    card = Image.open(io.BytesIO(card_png)).convert('RGB')
    ch = H - 60
    cw = round(card.width * ch / card.height)
    card = card.resize((cw, ch), Image.LANCZOS)
    mask = Image.new('L', (cw, ch), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, cw - 1, ch - 1), radius=14, fill=255)
    im.paste(card, (W - cw - 60, 30), mask)

    d = ImageDraw.Draw(im)
    x, right = 72, W - cw - 60 - 56
    width = right - x
    dt = datetime.date.fromisoformat(key)
    d.text((x, 62), NAME, font=ImageFont.truetype(FONT_BOLD, 30), fill=c['accent'])
    d.text((x, 108), f"{dt.year}.{dt.month:02d}.{dt.day:02d}　星期{WEEK[dt.weekday()]}",
           font=ImageFont.truetype(FONT, 26), fill=c['soft'])

    d.text((x, 150), e['title'], font=ImageFont.truetype(FONT_BOLD, 34), fill=c['accent'])
    q = quote_of(e)
    for size in (52, 46, 40, 34):
        f = ImageFont.truetype(FONT_BOLD, size)
        lines = wrap(d, q, f, width)
        if len(lines) <= 4:
            break
    y = 214
    for ln in lines:
        d.text((x, y), ln, font=f, fill=c['text'])
        y += round(size * 1.4)
    sf = ImageFont.truetype(FONT, 26)
    for ln in wrap(d, source_line(e), sf, width):
        d.text((x, y + 18), ln, font=sf, fill=c['soft'])
        y += 38
    out = io.BytesIO()
    im.save(out, 'JPEG', quality=82, optimize=True, progressive=True)
    return out.getvalue()


def page(key, e):
    y = ymd(key)
    dt = datetime.date.fromisoformat(key)
    title = f"{NAME}・{dt.month}月{dt.day}日"
    desc = html.escape(description(e), quote=True)
    target = f"../#{y}"
    return f'''<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="{NAME}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{SITE}d/{y}.html">
<meta property="og:image" content="{SITE}og/{y}.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url={target}">
<script>location.replace('{target}');</script>
</head>
<body>
<p><a href="{target}">打開{NAME}：{dt.month} 月 {dt.day} 日</a></p>
</body>
</html>
'''


def check(entries):
    problems = []
    for key, e in entries.items():
        y = ymd(key)
        p, o = ROOT / f'd/{y}.html', ROOT / f'og/{y}.jpg'
        if not p.exists():
            problems.append(f'{key} 缺分享頁 d/{y}.html')
        elif html.escape(description(e), quote=True) not in p.read_text(encoding='utf-8'):
            problems.append(f'{key} 分享頁內容跟目前的語錄不一致（改過語錄要重跑）')
        if not o.exists():
            problems.append(f'{key} 缺預覽圖 og/{y}.jpg')
        elif Image.open(o).size != (1200, 630):
            problems.append(f'{key} 預覽圖尺寸不是 1200×630')
    extra = {f.stem for f in (ROOT / 'd').glob('*.html')} - {ymd(k) for k in entries}
    for y in sorted(extra):
        problems.append(f'd/{y}.html 沒有對應的語錄（多出來的舊檔）')
    return problems


def render_cards(keys):
    from playwright.sync_api import sync_playwright
    server = subprocess.Popen([sys.executable, str(ROOT / 'tools/dev_server.py'), str(PORT)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='chrome')
            pg = browser.new_page(viewport={'width': 400, 'height': 800})
            pg.goto(f'http://localhost:{PORT}/#{ymd(keys[0])}')
            pg.wait_for_function(f"document.documentElement.dataset.rendered === '{keys[0]}'", timeout=60000)
            # 攔下存圖面板，改成把 PNG 交給這支程式
            pg.evaluate("""() => { CardExport.openSheet = (blob) => {
              const r = new FileReader(); r.onload = () => { window.__png = r.result.split(',')[1]; }; r.readAsDataURL(blob); }; }""")
            for key in keys:
                pg.evaluate(f"() => {{ window.__png = null; location.hash = '#{ymd(key)}'; }}")
                pg.wait_for_function(f"document.documentElement.dataset.rendered === '{key}'", timeout=60000)
                pg.click('#save')
                pg.wait_for_function('window.__png !== null', timeout=60000)
                yield key, base64.b64decode(pg.evaluate('window.__png'))
            browser.close()
    finally:
        server.terminate()


def main():
    entries = load_entries()
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--check' in sys.argv:
        problems = check(entries)
        for p in problems:
            print('  -', p)
        print(f'檢查 {len(entries)} 天：' + (f'{len(problems)} 個問題' if problems else '全部一致'))
        sys.exit(1 if problems else 0)

    keys = [k for k in entries if not args or any(k.startswith(a) for a in args)]
    (ROOT / 'd').mkdir(exist_ok=True)
    (ROOT / 'og').mkdir(exist_ok=True)
    t0 = time.time()
    for i, (key, png) in enumerate(render_cards(keys), 1):
        y = ymd(key)
        (ROOT / f'og/{y}.jpg').write_bytes(compose(png, key, entries[key]))
        (ROOT / f'd/{y}.html').write_text(page(key, entries[key]), encoding='utf-8', newline='\n')
        if i % 30 == 0 or i == len(keys):
            print(f'{i}/{len(keys)}  {key}  {time.time() - t0:.0f} 秒', flush=True)


if __name__ == '__main__':
    main()
