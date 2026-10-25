"""重要事件行事曆（人工維護）→ site/data/macro_calendar.json。每筆都附官方來源；更新時修改本檔後重跑。
用法：python3 tools/make_macro_calendar.py"""
import json, pathlib
R = pathlib.Path(__file__).resolve().parent.parent / "site" / "data"
FED = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
CPI = "https://www.bls.gov/schedule/news_release/cpi.htm"
EMP = "https://www.bls.gov/schedule/news_release/empsit.htm"
CBC = "https://www.cbc.gov.tw/tw/cp-302-189514-82841-1.html"
TAIFEX = "https://www.taifex.com.tw/cht/2/tX"
ev = [
 # d＝日期（事件日；跨日者以美東當地日期為準，tw 為對應台北時間）、k＝類別、t＝名稱、tw＝台北時間、s＝來源
 dict(d="2026-10-27", d2="2026-10-28", k="美國", t="FOMC 利率會議（10/27–28，決議 10/28 美東 14:00）", tw="決議約台北時間 10/29 02:00", s=FED),
 dict(d="2026-11-03", k="美國", t="美國期中選舉日（法定選舉日：11 月第一個星期一後的星期二）", tw="", s="https://www.usa.gov/election-day"),
 dict(d="2026-11-06", k="美國", t="美國 10 月非農就業報告（Employment Situation）", tw="台北時間 11/06 21:30", s=EMP),
 dict(d="2026-11-10", k="美國", t="美國 10 月消費者物價指數 CPI", tw="台北時間 11/10 21:30", s=CPI),
 dict(d="2026-11-18", k="台灣", t="台指期（臺股期貨）11 月契約最後結算日（每月第三個星期三；遇休市順延）", tw="", s=TAIFEX),
 dict(d="2026-12-04", k="美國", t="美國 11 月非農就業報告", tw="台北時間 12/04 21:30", s=EMP),
 dict(d="2026-12-08", d2="2026-12-09", k="美國", t="FOMC 利率會議（12/8–9，含經濟預測 SEP，決議 12/9 美東 14:00）", tw="決議約台北時間 12/10 03:00", s=FED),
 dict(d="2026-12-10", k="美國", t="美國 11 月消費者物價指數 CPI", tw="台北時間 12/10 21:30", s=CPI),
 dict(d="2026-12-16", k="台灣", t="台指期 12 月契約最後結算日（每月第三個星期三；遇休市順延）", tw="", s=TAIFEX),
 dict(d="2026-12-17", k="台灣", t="中央銀行理監事聯席會議（會後記者會）", tw="", s=CBC),
]
(R / "macro_calendar.json").write_text(json.dumps(dict(events=ev, updated="2026-10-25", maintained="人工維護",
  note="本表由人工依官方公告整理（美國聯準會、美國勞工統計局、中央銀行、期交所契約規格），只列已由官方公布者；官方改期時以官方公告為準，本站更新日見 updated。台股休市日另依證交所休市日程自動顯示。"), ensure_ascii=False, separators=(",", ":")))
print(len(ev), "events")
