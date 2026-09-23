"""下載校對用的古籍原文到 sources/（這些檔案來自他人的文庫，不放進本專案的 repository）。

用法：python tools/fetch_sources.py
下載後即可執行 python tools/validate.py。
"""
import urllib.parse
import urllib.request
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "sources"

CHTXT = "https://raw.githubusercontent.com/JasonWade001/chtxt/HEAD/"
ANCIENT = "https://raw.githubusercontent.com/hanzhaodeng/chinese-ancient-text/HEAD/"
FILES = {
    # 存檔名稱: 來源網址
    "中庸.txt": CHTXT + "a.儒家/中庸.txt",
    "大學.txt": CHTXT + "a.儒家/大學.txt",
    "論語.txt": CHTXT + "a.儒家/論語.txt",
    "道德經.txt": CHTXT + "b.道家/道德經.txt",
    "六祖壇經.txt": CHTXT + "l.佛教/六祖壇經.txt",
    "般若波羅蜜多心經.txt": CHTXT + "l.佛教/般若波羅蜜多心經.txt",
    "金剛經.txt": CHTXT + "l.佛教/金剛經.txt",
    "周易.json": ANCIENT + "周易.json",
    "易傳.json": ANCIENT + "易传.json",
    "莊子.json": ANCIENT + "庄子.json",
    "vajra.json": "https://raw.githubusercontent.com/bowwowxx/chisong/HEAD/data/vajra.json",
}


def main() -> None:
    SRC.mkdir(exist_ok=True)
    for name, url in FILES.items():
        base, _, path = url.partition("/HEAD/")
        quoted = f"{base}/HEAD/{urllib.parse.quote(path)}"
        with urllib.request.urlopen(quoted, timeout=60) as r:
            (SRC / name).write_bytes(r.read())
        print("✓", name)


if __name__ == "__main__":
    main()
