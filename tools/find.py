"""在 sources/ 古籍中搜尋關鍵字，顯示前後文（繁體）。用法：python tools/find.py 關鍵字 [前後字數]"""
import sys
sys.path.insert(0, __import__("os").path.dirname(__file__))
import opencc
import validate as v

s2t = opencc.OpenCC("s2t")
key, width = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 30
raw = {}
for p in v.SRC.iterdir():
    if p.suffix == ".txt":
        raw[p.stem] = p.read_text(encoding="utf-8")
    elif p.suffix == ".json":
        d = __import__("json").loads(p.read_text(encoding="utf-8"))
        raw[p.stem] = "\n".join(d["segs"]) if "segs" in d else "\n".join(f"【{a['title']}】" + "".join(a["content"]) for a in d["articles"])
k = v.t2s.convert(key)
for name, text in raw.items():
    simp = v.t2s.convert(text)
    i = simp.find(k)
    n = 0
    while i != -1 and n < 3:
        print(f"[{name}] {s2t.convert(text[max(0, i - width):i + len(key) + width]).replace(chr(10), ' ')}")
        i = simp.find(k, i + 1)
        n += 1
