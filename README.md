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

## ETF 持股資料狀態（`scripts/etf.py` → `site/data/etf.json`）
- 來源為各投信官網公開持股／PCF，只收台股 4 碼持股；官網以 403 等方式拒絕自動化存取者**不繞過**。
- 每檔三種狀態：**最新**（本輪取得，或本輪抓取失敗但沿用的基準日已是最新交易日——例如最新交易日之後休市，官網沒有更新的資料可抓，前台不標過期、不顯示警告，`reason` 僅留作內部備註）；**沿用舊資料**（`stale`＝基準日**早於**最新交易日，前台標示基準日與原因）；**無資料／未涵蓋**（從未取得，例如國泰 00878，標明原因，不補假資料）。
- 最新交易日取自 `stocks.json` 的證交所資料日（`twseDate`）；判斷函式為 `etf.is_stale()`，前端以 `etfStale()` 再核對一次。

## 支撐壓力 v2（`scripts/levels.py`）
- 候選價位各帶「依據」標籤（前波高點／前高轉支撐、近期高點與爆量K高點〔尚未確認，標「暫定」〕、前波低點〔只當支撐〕、爆量K高低點、成交量密集區、缺口上下緣、MA5/20/60/120 反壓或支撐、整理平台與量縮、均線多頭結構、近期低點）；**波段低點不再當壓力**。
- 價格帶寬度依 14 日平均真實波幅調整（支撐 0.25×、壓力 0.55×，限制 0.8%–3.5%）；**共振強度＝同帶內不同依據種類數**：1 招弱、2 招中、3 招強、4 招以上極強。
- 第一壓力：弱／中（≤2 招）且距現價 <1% 者降為小字；第二壓力需與第一壓力帶拉開（max(2%, 0.65×波幅)）；+10% 以外最多列 3 個中長期壓力；−20% 以外列長期結構價位。
- 每帶附歷史觸及／守住（支撐）或受阻／突破（壓力）次數；另算「布局參考區」（近 60 日成交量集中區，自行計算）。
- `scripts/relevels.py`：離線重算 history 內 levels。`tools/levels_backtest.py`：守住率／壓力有效率回測（含與同距離對照帶比較）。價位皆為觀察價位，不是買賣建議。
