"""
產生本站自己的字型檔（只含網站用得到的字）。

為什麼要這樣做：
  以前直接用 Google Fonts，它把中文字型切成上百個小檔，一頁用到的字散在幾十個檔裡，
  第一次打開就要下載約 4 MB，之後每換一天還要再抓新的字。
  全部內容其實只用到兩、三千個字，所以把這些字一次做成字型檔放在 fonts/ 底下：
  下載一次就涵蓋所有日子，換日不用再等字型，離線也完整。

用法（在網站資料夾裡執行）：
  python tools/build_fonts.py            產生 fonts/*.woff2、css/fonts.css，並更新 index.html 的預載標籤
  python tools/build_fonts.py --check    只檢查：內容用到的字是否都在字型檔裡（缺字 exit 1）

⛔ 改過語錄、節日或畫面上的文字後，要重跑本工具（就像 build_share.py 一樣），否則新字會用手機內建字型顯示。

原始字型（SIL Open Font License，來自 github.com/google/fonts 的 ofl/ 資料夾）放在
  ..\\..\\字型原檔\\（兩個日曆共用，不放進 repo）。也可以用環境變數 FONT_SRC 指定。
需要：pip install fonttools brotli；本機要有 node（用來算出每一天的農曆字串）。
"""
import hashlib
import io
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(os.environ.get('FONT_SRC', ROOT.parent / '字型原檔'))
FONTS = ROOT / 'fonts'
CSS = ROOT / 'css' / 'fonts.css'
CHARSET = FONTS / 'charset.txt'

# 每個網站用到的字型：(CSS 字型名稱, 原始檔, 字重或字重範圍, 輸出檔名前綴)
SITES = {
    'ink-calendar': [
        ('LXGW WenKai TC', 'LXGWWenKaiTC-Regular.ttf', 400, 'wenkai-400'),
        ('LXGW WenKai TC', 'LXGWWenKaiTC-Bold.ttf', 700, 'wenkai-700'),
        ('Noto Serif TC', 'NotoSerifTC[wght].ttf', (300, 400), 'notoserif-300-400'),
    ],
    'anime-calendar': [
        ('Noto Sans TC', 'NotoSansTC[wght].ttf', (200, 500), 'notosans-200-500'),
        ('Zen Kaku Gothic New', 'ZenKakuGothicNew-Regular.ttf', 400, 'zenkaku-400'),
    ],
}
# 用 sw.js 的快取名稱判斷是哪個網站（資料夾名稱在每台電腦、GitHub 上都可能不同）
SITE = re.search(r"VERSION = '(\w+-calendar)-v\d+'", (ROOT / 'sw.js').read_text(encoding='utf-8'))[1]
FACES = SITES[SITE]

# 農曆、節氣、干支：用網站自己的 lunar.js 把 2026～2035 每一天的字串算出來（比把整個 lunar.js 的字收進來少七百多字）
LUNAR_JS = r"""
globalThis.window = globalThis;
const vm = require('vm'), fs = require('fs');
vm.runInThisContext(fs.readFileSync(process.argv[1] + '/js/vendor/lunar.js', 'utf8'));
Object.assign(globalThis, module.exports); // node -e 有 module，lunar.js 會匯出到 module.exports 而不是掛在全域
vm.runInThisContext(fs.readFileSync(process.argv[1] + '/js/lunar-info.js', 'utf8'));
const out = new Set();
for (let d = new Date(2026, 0, 1); d < new Date(2036, 0, 1); d.setDate(d.getDate() + 1)) {
  const i = LunarInfo.info(d);
  for (const s of [i.monthName, i.week, i.ganzhiYear, i.lunarDate, i.jieqi]) for (const c of s) out.add(c);
}
process.stdout.write(JSON.stringify([...out].join('')));
"""


def strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from strings(v)


def needed_chars():
    """網站畫面上可能出現的所有字。"""
    chars = set(chr(c) for c in range(0x20, 0x7F))  # 英數與半形符號
    chars |= set('，。、；：！？「」『』（）《》〈〉…—─・〇　')
    for p in sorted((ROOT / 'data').rglob('*.json')):
        for s in strings(json.loads(p.read_text(encoding='utf-8'))):
            chars |= set(s)
    # 程式與網頁裡寫死的文字（按鈕、提示、卡片上的固定字）
    for p in [ROOT / 'index.html', *sorted((ROOT / 'js').glob('*.js'))]:
        chars |= set(p.read_text(encoding='utf-8'))
    out = subprocess.run(['node', '-e', LUNAR_JS, str(ROOT)], capture_output=True, text=True, encoding='utf-8', check=True)
    chars |= set(json.loads(out.stdout))
    return {c for c in chars if c >= ' ' and c not in '​﻿'}


def build_face(src, weight, chars):
    font = TTFont(src)
    opts = subset.Options()
    opts.flavor = None
    opts.hinting = False          # 螢幕和 canvas 都用不到 TrueType hinting，拿掉省空間
    opts.desubroutinize = True
    opts.layout_features = ['*']  # 保留全部排版功能（直書替換字、標點擠壓等）
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(text=''.join(sorted(chars)))
    sub.subset(font)
    if isinstance(weight, tuple):
        font = instancer.instantiateVariableFont(font, {'wght': weight})
    font.flavor = 'woff2'
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


def covered(path):
    """字型檔實際有字形的字。"""
    cmap = TTFont(path).getBestCmap()
    return {chr(c) for c in cmap}


def check():
    if not CSS.exists():
        print('✗ 還沒有 css/fonts.css，請先執行 python tools/build_fonts.py')
        return 1
    files = re.findall(r"url\('\.\./fonts/([^']+)'\)", CSS.read_text(encoding='utf-8'))
    problems = [f'css/fonts.css 指到不存在的檔案 fonts/{f}' for f in files if not (FONTS / f).exists()]
    if not problems:
        built = set(CHARSET.read_text(encoding='utf-8')) if CHARSET.exists() else set()
        missing = sorted(c for c in needed_chars() if c not in built and not c.isspace())
        if missing:
            problems.append(f'有 {len(missing)} 個字不在字型檔裡：{"".join(missing[:40])}{"…" if len(missing) > 40 else ""}')
    for p in problems:
        print('  ✗', p)
    print(f'字型檢查：' + (f'{len(problems)} 個問題，請重跑 python tools/build_fonts.py' if problems else '內容用到的字都在字型檔裡'))
    return 1 if problems else 0


def main():
    if '--check' in sys.argv:
        sys.exit(check())
    chars = needed_chars()
    FONTS.mkdir(exist_ok=True)
    old = set(FONTS.glob('*.woff2'))
    css, preload, made = [], [], set()
    for family, file, weight, prefix in FACES:
        data = build_face(SRC / file, weight, chars)
        name = f'{prefix}.{hashlib.sha1(data).hexdigest()[:10]}.woff2'  # 內容變了檔名就變，快取可以放心永久保存
        (FONTS / name).write_bytes(data)
        made.add(FONTS / name)
        w = f'{weight[0]} {weight[1]}' if isinstance(weight, tuple) else weight
        css.append(f"@font-face {{\n  font-family: '{family}';\n  font-style: normal;\n  font-weight: {w};\n"
                   f"  font-display: swap;\n  src: url('../fonts/{name}') format('woff2');\n}}")
        preload.append(f'<link rel="preload" href="fonts/{name}" as="font" type="font/woff2" crossorigin>')
        print(f'  {name}  {len(data) // 1024} KB')
    for f in old - made:
        f.unlink()
    CSS.write_text('/* 由 tools/build_fonts.py 產生，請勿手改 */\n' + '\n'.join(css) + '\n', encoding='utf-8')
    # 記下這次做字型時收進來的字，給 --check 比對；原始字型本來就沒有的字（例如表情符號）另外列出來提醒
    CHARSET.write_text(''.join(sorted(chars)), encoding='utf-8')
    have = set()
    for f in made:
        have |= covered(f)
    absent = sorted(c for c in chars if c not in have and not c.isspace())
    if absent:
        print(f'  ⚠ 原始字型都沒有這 {len(absent)} 個字，會用手機內建字型顯示：{"".join(absent)}')

    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    block = '<!-- FONTS:START 由 tools/build_fonts.py 產生 -->\n' + '\n'.join(preload) + '\n<link rel="stylesheet" href="css/fonts.css">\n<!-- FONTS:END -->'
    html, n = re.subn(r'<!-- FONTS:START.*?<!-- FONTS:END -->', lambda m: block, html, flags=re.S)
    if n != 1:
        sys.exit('✗ index.html 裡找不到 <!-- FONTS:START --> … <!-- FONTS:END --> 區塊')
    (ROOT / 'index.html').write_text(html, encoding='utf-8', newline='\n')
    total = sum(f.stat().st_size for f in made)
    print(f'完成：{len(chars)} 個字，{len(made)} 個字型檔，共 {total // 1024} KB')
    sys.exit(check())


if __name__ == '__main__':
    main()
