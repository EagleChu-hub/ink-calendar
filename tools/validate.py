"""校對 data/quotes/*.json（每月一檔，key 為 YYYY-MM-DD）：
- 2026-09-23 至 2027-12-31 每天是否齊全（--partial 時只檢查已有的日子）
- 欄位是否完整、標題是否為 4 字（印章 2x2 排版）
- 原文是否逐字出現在 sources/ 的古籍文本中（忽略標點、繁簡、異體；sources/errata.txt 為通行本勘誤）
- 出處（章、篇、品、分、卦）是否與文庫章節一致（中庸、大學、心經無章節標題，不檢查）
- 原文有無重複

用法：python tools/validate.py [--partial]
"""
import datetime
import json
import re
import sys
from pathlib import Path

import opencc

ROOT = Path(__file__).resolve().parent.parent
START, END = datetime.date(2026, 9, 23), datetime.date(2027, 12, 31)
SRC = ROOT / "sources"
t2s = opencc.OpenCC("t2s")

# 異體字統一（t2s 後仍可能不同的字）
VARIANTS = str.maketrans({"爲": "为", "於": "于", "衆": "众", "眾": "众", "台": "台", "臺": "台",
                          "嚮": "向", "旛": "幡", "遯": "遁", "閒": "闲", "間": "间", "峯": "峰", "脩": "修", "邪": "耶"})


def norm(s: str) -> str:
    s = t2s.convert(s).translate(VARIANTS)
    return "".join(ch for ch in s if "一" <= ch <= "鿿" or "㐀" <= ch <= "䶿")


def load_corpus() -> dict[str, str]:
    books: dict[str, str] = {}
    for p in SRC.iterdir():
        if p.name == "errata.txt":
            lines = p.read_text(encoding="utf-8").splitlines()
            books["勘誤表"] = "|".join(ln.split("#")[0] for ln in lines if ln and not ln.startswith("#"))
        elif p.suffix == ".txt":
            # 去掉校勘夾注，例如「持而保之(一作「寳而持之」)」
            books[p.stem] = re.sub(r"\([^)]*\)", "", p.read_text(encoding="utf-8"))
        elif p.suffix == ".json":
            d = json.loads(p.read_text(encoding="utf-8"))
            if "segs" in d:  # vajra.json
                books["金剛經(chisong)"] = "".join(d["segs"])
            else:
                books[p.stem] = "".join("".join(a["content"]) for a in d["articles"])
    return {k: norm(v) for k, v in books.items()}


def load_sections() -> list[tuple[list[str], str]]:
    """把有章節標題的古籍切成段落，回傳 [(出處欄必須包含的字串們, 段落正規化文字)]。
    中庸、大學、心經沒有章節標題，不在此列（出處由人工確認）。"""
    out: list[tuple[list[str], str]] = []

    def split_txt(name: str, pattern: str, label):
        text = re.sub(r"\([^)]*\)", "", (SRC / f"{name}.txt").read_text(encoding="utf-8"))
        parts = re.split(pattern, text)
        for i in range(1, len(parts) - 1, 2):
            out.append(([name, label(parts[i])], norm(parts[i + 1])))

    split_txt("道德經", r"○ (第.+?章)\n", lambda h: h)
    split_txt("論語", r"## (.+?)篇第.+?\n", lambda h: h)
    split_txt("六祖壇經", r"## (.+?品)第.+?\n", lambda h: h)
    split_txt("金剛經", r"○ (.+?分第.+?)\n", lambda h: h)

    for a in json.loads((SRC / "莊子.json").read_text(encoding="utf-8"))["articles"]:
        out.append((["莊子", a["title"].split("·")[-1]], norm("".join(a["content"]))))
    for a in json.loads((SRC / "周易.json").read_text(encoding="utf-8"))["articles"]:
        out.append((["易經", a["title"]], norm("".join(a["content"]))))
    for a in json.loads((SRC / "易傳.json").read_text(encoding="utf-8"))["articles"]:
        kind, _, gua = a["title"].partition("·")
        # 彖傳、象傳依卦分段（「象传上·乾」）；繫辭等依章分段（「系辞传上·第八章」），只核對傳名
        need = ["易經", kind[:2]] + ([gua + "卦"] if kind[:1] in "彖象" and gua else [])
        out.append((need, norm("".join(a["content"]))))
    return [([norm(x) for x in need], text) for need, text in out]


def main() -> int:
    partial = "--partial" in sys.argv
    quotes: dict[str, dict] = {}
    for f in sorted((ROOT / "data" / "quotes").glob("*.json")):
        month = json.loads(f.read_text(encoding="utf-8"))
        for key in month:
            if not key.startswith(f.stem):
                print(f"✗ {key} 放錯檔案（在 {f.name}）")
        quotes.update(month)
    corpus = load_corpus()
    sections = load_sections()
    errors: list[str] = []

    if not partial:
        d = START
        while d <= END:
            key = d.isoformat()
            if key not in quotes:
                errors.append(f"{key}: 缺少內容")
            d += datetime.timedelta(days=1)

    seen: dict[str, str] = {}
    titles: dict[str, str] = {}
    for key, q in sorted(quotes.items()):
        for field in ("title", "quote", "source", "text"):
            if not q.get(field):
                errors.append(f"{key}: 缺少欄位 {field}")
        title = q.get("title", "")
        if len(title) != 4:
            errors.append(f"{key}: 標題「{title}」不是 4 個字")
        n = norm(q.get("quote", ""))
        # 標題要是當天的主題詞，不能直接截取原文（方印上重複原文等於沒有資訊）
        if title and norm(title) in n:
            errors.append(f"{key}: 標題「{title}」直接取自原文，請改寫成主題詞")
        if title in titles:
            errors.append(f"{key}: 標題「{title}」與 {titles[title]} 重複")
        titles[title] = key
        if not any(n in text for text in corpus.values()):
            errors.append(f"{key}: 原文找不到 —「{q.get('quote')}」（{q.get('source')}）")
        src = norm(q.get("source", ""))
        hits = [need for need, text in sections if n in text]
        if hits and not any(all(x in src for x in need) for need in hits):
            where = "、".join("・".join(need) for need in hits)
            errors.append(f"{key}: 出處「{q.get('source')}」可能有誤，文庫中這句在：{where}")
        for other, okey in seen.items():
            if n in other or other in n:
                errors.append(f"{key}: 原文與 {okey} 重複或互相包含")
        seen[n] = key
        tlen = len(q.get("text", ""))
        if not 45 <= tlen <= 110:
            errors.append(f"{key}: 白話短文 {tlen} 字（建議 60–90）")

    print(f"共 {len(quotes)} 則，比對古籍 {len(corpus)} 部")
    for e in errors:
        print("✗", e)
    if not errors:
        print("✓ 全部通過")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
