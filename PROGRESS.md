# 水墨日曆：專案進度與備忘

最後更新：2026-09-23

## 現況（已完成、已上線）
- 網站（GitHub Pages）：https://eaglechu-hub.github.io/ink-calendar/
- repository（公開）：https://github.com/EagleChu-hub/ink-calendar ，分支 `main`
- claude.ai 私人連結：https://claude.ai/artifact/8YMKxUYNaqAu3JuUEuzfoc （第 7 版；已宣告 downloads 能力）
- 內容：2026-09-23 至 2027-12-31 共 465 則，全部通過 `tools/validate.py`
- 離線快取版本：`sw.js` 的 `VERSION = 'ink-calendar-v7'`

## 版面決策（使用者已確認，勿改回）
- 日期在左（使用者不喜歡日期在右）。
- 右側直書原文，由右至左；題字方印當「引首章」蓋在第一行正上方（104px），印文讀序改為「先由左到右、再由上到下」。
- 短句（1–2 行）置中在「日期右緣到右邊界」的空白中；字級上限：1 行 110、2 行以上 96。
- 合併行（同一句內的子句，以 。；！？ 為句界，冒號視為子句）在分句處加淡墨句讀圈點。
- 出處維持在短文下方靠右；篆書落款章「毅講堂」（64px）蓋在出處那行末端。
- 標題為 4 字主題詞，不可直接取自原文、全年不重複（validate.py 會檢查）。
- 朱紅最多三處：節日框存在時朱紅夕陽改為淡墨。

## 程式結構
- `js/card.js` 卡片繪製（Canvas 1080×1920）；`js/scene.js` 山水場景合成＋落款章載入；`js/ink.js` 宣紙紋理與程序化山水備援；`js/app.js` 互動；`js/export.js` 存圖（Artifact 內走 downloads 能力）。
- 素材：`assets/`（Claude Design 交付，已逐檔審閱）；場景範本 `data/scenes.json`（13 個）。
- 工具：`tools/validate.py`（校對）、`tools/fetch_sources.py`（下載校對用古籍原文，sources/ 不進 repo）、`tools/dev_server.py`（本機預覽 :8765，可 POST /__save 存圖）、`tools/build_artifact.py`（產生 dist/ 供 Artifact 發布）、`tools/calendar_notes.js`、`tools/find.py`。

## 更新流程
1. 改內容 → `python tools/validate.py`
2. `sw.js` VERSION 加一
3. `git add -A` → `git commit` → `git push`（家裡電腦：gh 在 PATH 上（`C:\Program Files\GitHub CLI\gh.exe`），已登入 EagleChu-hub；學校電腦是 `%LOCALAPPDATA%\gh-cli\bin\gh.exe`）
4. 若要同步 Artifact：`python tools/build_artifact.py`，再用同一 URL 重新發布

## 備忘 / 待辦（可選）
- 易經象傳的卦名（如「損」）會單獨成一行；使用者尚未決定是否併入前行。
- 153 個標題為 Claude 改寫，使用者可自行瀏覽 `data/quotes/` 調整。
- 崇羲篆體授權 CC BY-ND 3.0 TW，已在「關於與授權」標示。
- 本機未上傳的資料：`水墨日曆 App 設計/`（設計原檔）、`handoff-claude-design/`、交接包 zip、`dist/`、`sources/` 原文。

## 2026-09-25：每日提醒＋分享到脆／LINE
- 跟空鏡日曆一起做，細節見 `動畫語錄日曆\進度備忘.md` 的同名段落，以及 `日曆推播\README.md`。
- sw.js VERSION 已改成 `ink-calendar-v8`（還沒 push）。
- 家裡電腦沒有 opencc，`tools/validate.py` 跑不起來（`pip install opencc` 後才能跑）。這次沒改 data/，已用 git diff 確認。
- Artifact 版沒有同步；提醒功能在 Artifact 裡會顯示「這個預覽環境不能開啟推播」。
