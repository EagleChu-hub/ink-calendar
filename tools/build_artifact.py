"""產生 claude.ai Artifact 版的頁面：dist/index.html，以及要一起發布的檔案清單 dist/files.json
Artifact 會自己包上 <html><head><body>，所以只取 index.html 中 ARTIFACT:START/END 之間的內容，
並拿掉 </head><body> 兩個標籤。與 GitHub Pages 版的差異：
- lunar.js 改從 jsDelivr 載入（Artifact 允許的 CDN），不另外發布
- 拿掉 manifest 連結（Artifact 內無法「加入主畫面」）
- 山水素材只發布場景範本實際用到的檔案，落款章只發布 chosen.svg

用法：python tools/build_artifact.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LUNAR_CDN = "https://cdn.jsdelivr.net/npm/lunar-javascript@1.7.7/lunar.js"


def main() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    m = re.search(r"<!-- ARTIFACT:START -->\n(.*)<!-- ARTIFACT:END -->", html, re.S)
    if not m:
        raise SystemExit("index.html 找不到 ARTIFACT:START / ARTIFACT:END 標記")
    body = re.sub(r"^\s*</?(head|body)>\s*\n", "", m.group(1), flags=re.M)
    body = re.sub(r'^<link rel="manifest"[^>]*>\n', "", body, flags=re.M)
    body = body.replace('src="js/vendor/lunar.js"', f'src="{LUNAR_CDN}"')
    out = ROOT / "dist" / "index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(body, encoding="utf-8")

    scenes = json.loads((ROOT / "data" / "scenes.json").read_text(encoding="utf-8"))
    used = {L["asset"] for s in scenes for L in s["layers"]} | {"sun-01"}  # sun-01：朱紅夕陽的替代
    paths = [
        *sorted(p for p in (ROOT / "css").glob("*.css")),
        *sorted(p for p in (ROOT / "js").glob("*.js")),  # 不含 js/vendor
        *sorted((ROOT / "data").rglob("*.json")),
        *(ROOT / "assets" / "landscape" / f"{n}.svg" for n in sorted(used)),
        ROOT / "assets" / "seal" / "chosen.svg",
        *sorted((ROOT / "icons").glob("*.png")),
    ]
    files = {p.relative_to(ROOT).as_posix(): p.relative_to(ROOT).as_posix() for p in paths}
    (ROOT / "dist" / "files.json").write_text(json.dumps(files, ensure_ascii=False, indent=1), encoding="utf-8")
    size = sum(p.stat().st_size for p in paths)
    print(f"dist/index.html 已產生；另有 {len(files)} 個檔案，共 {size // 1024} KB（清單在 dist/files.json）")


if __name__ == "__main__":
    main()
