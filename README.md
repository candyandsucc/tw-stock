# 台股研究室
- `python3 scripts/fetch.py` 抓取官方資料 → `site/data/*.json`（環境變數 TOP_N、MONTHS、EXTRA、SLEEP 可調）
- `cd site && python3 -m http.server 8765` 本機預覽
- `.github/workflows/daily.yml`：週一至週五 15:00（台北）自動更新（尚未部署）

## 休市日自動略過
`scripts/market_calendar.py` 在每日更新前判斷：週末 → 證交所「市場開休市日期」表（國定假日、補假、封關）→ 以 MI_INDEX 探測當日是否有交易資料（涵蓋颱風假等臨時休市）。休市則不抓資料、不 commit、不部署。手動執行 workflow 可勾選 `force` 強制更新。
