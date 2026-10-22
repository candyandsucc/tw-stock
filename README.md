# 台股研究室
- `python3 scripts/fetch.py` 抓取官方資料 → `site/data/*.json`（環境變數 TOP_N、MONTHS、EXTRA、SLEEP 可調）
- `cd site && python3 -m http.server 8765` 本機預覽
- `.github/workflows/daily.yml`：週一至週五 15:00（台北）自動更新（尚未部署）
