# 台股研究室
- `python3 scripts/fetch.py` 抓取官方資料 → `site/data/*.json`（環境變數 TOP_N、MONTHS、EXTRA、SLEEP 可調）
- `cd site && python3 -m http.server 8765` 本機預覽
- `.github/workflows/daily.yml`：週一至週五 15:00（台北）自動更新（尚未部署）

## 休市日自動略過
`scripts/market_calendar.py` 在每日更新前判斷：週末 → 證交所「市場開休市日期」表（國定假日、補假、封關）→ 以 MI_INDEX 探測當日是否有交易資料（涵蓋颱風假等臨時休市）。休市則不抓資料、不 commit、不部署。手動執行 workflow 可勾選 `force` 強制更新。

## 技術分析涵蓋範圍與情境篩選
- `scripts/backfill.py`：回補全市場每日收盤快照（`snapshots/YYYY-MM-DD_上市|上櫃.json`，證交所 MI_INDEX／櫃買 dailyQuotes）。
- `scripts/universe.py`：近 20 日成交值前 400 檔一般股，由快照建立歷史檔（不逐檔打 STOCK_DAY）；自選／預設清單仍用 STOCK_DAY。
- `scripts/analytics.py`：情境（跌深反彈／外資撐腰／量能起飛／站穩轉強／剛站回／法人連買）、位階五級、風險檢查 → `site/data/screen.json`；門檻與說明寫在 `defs`，頁面可展開查看。生命線＝MA20。
- `scripts/fundamentals.py`：本益比／殖利率／淨值比（證交所 BWIBBU_ALL、櫃買 tpex_mainboard_peratio_analysis）＋近 12 個月月營收（公開資訊觀測站 t21sc03）→ `site/data/fund.json`、`rev.json`；逐月快取於 `snapshots/rev/`。
- 全站為「資料分類與觀察」，不是買賣建議；repo 不放任何個人持股資料。
