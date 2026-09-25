# 水墨日曆

每天一句古籍原文，搭配一段白話短文，並配上水墨山水的手機日曆。收錄 2026/9/23 至 2027/12/31，共 465 天。可以存成 1080×1920 的圖卡，拿來發 IG 限動或當桌布。

- 網站（GitHub Pages，可加入主畫面、離線使用）：https://eaglechu-hub.github.io/ink-calendar/
- claude.ai 私人連結：https://claude.ai/artifact/8YMKxUYNaqAu3JuUEuzfoc
- 純前端，不需要 build 工具。只有「每日提醒」推播由另一個 Cloudflare Worker（calendar-push）送出。

## 每日提醒與分享

- 每日提醒：底部「每日提醒」選時間後開啟，每天在該整點（台北時間）收到當天的原文推播。iPhone 需 iOS 16.4 以上，並先「加入主畫面」再從主畫面開啟。Worker 只儲存瀏覽器的推播位址與時間。
- 分享：按「分享」打開面板，可以用系統分享直接傳圖卡，或按 Threads、LINE 分享當天的句子與連結。連結是 `d/YYYYMMDD.html`（由 `python tools/build_share.py` 產生，改過內容要重跑），預覽圖是那一天的縮圖。

## 資料夾

| 路徑 | 內容 |
|---|---|
| `index.html`、`css/`、`js/` | 程式本體 |
| `data/quotes/YYYY-MM.json` | 每月內容，key 為 `YYYY-MM-DD`，欄位：`title`（4 字，印在題字方印上）、`quote`、`source`、`text` |
| `data/scenes.json` | 山水場景範本（Claude Design 設計） |
| `data/festivals-tw.json` | 台灣節日 |
| `assets/` | 山水元素、落款章、圖示原檔（SVG） |
| `icons/` | App 圖示 PNG（由 `assets/icon/app-icon.svg` 轉出） |
| `sources/` | 校對用的古籍原文（用 `python tools/fetch_sources.py` 下載，不放進 repository）；`errata.txt` 為通行本勘誤 |
| `tools/` | 校對、開發、打包工具 |
| `水墨日曆 App 設計/` | Claude Design 交回的原始檔案（含 mockup 與 NOTES.md） |

## 常用操作

在電腦上預覽（瀏覽器開 http://localhost:8765 ）：

```bash
python tools/dev_server.py
```

網址後加 `#20270206` 可以直接跳到指定日期。

第一次校對前，先下載古籍原文：

```bash
python tools/fetch_sources.py
```

修改內容後校對。會檢查天數是否齊全、原文是否逐字正確、出處是否正確、有無重複，以及標題不可直接取自原文：

```bash
python tools/validate.py
```

列出某段期間的節氣與節日：

```bash
node tools/calendar_notes.js 2027-01 2027-03
```

更新 claude.ai 線上版：執行下面的指令，再請 Claude 用 `dist/index.html` 重新發布到同一個連結。

```bash
python tools/build_artifact.py
```

## 更新網站

改完內容或程式後，把 `sw.js` 裡的 `VERSION` 加一（例如 `ink-calendar-v8`），手機上的離線快取才會換新，然後上傳：

```bash
git add -A
```

```bash
git commit -m "更新內容"
```

```bash
git push
```

約一分鐘後網站就會更新。

## 授權與來源

- 古籍原文屬公有領域。白話短文為原創。
- 落款篆字：崇羲篆體，中央研究院小學堂，CC BY-ND 3.0 TW。App 內「關於與授權」頁已標示。
- 霞鶩文楷 TC、思源宋體 TC：SIL Open Font License。
- lunar-javascript：MIT License。
