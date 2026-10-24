#!/usr/bin/env python3
"""判斷指定日期（預設台北今天）台股是否開市；供 daily.yml 在更新前決定是否略過。
1) 週六日 → 休市
2) 證交所「市場開休市日期」表（holidaySchedule）→ 國定假日、補假、春節封關等
3) 以證交所 MI_INDEX 探測當日是否有交易資料（可涵蓋颱風假等臨時休市；網路錯誤時不誤判，視為開市）
用法：python scripts/market_calendar.py [YYYY-MM-DD] [--no-probe]
輸出 GITHUB_OUTPUT：trading=true|false、reason=...；一律 exit 0。"""
import json, os, sys, datetime as dt, urllib.request

UA = {"User-Agent": "Mozilla/5.0 tw-stock-lab"}
TZ = dt.timezone(dt.timedelta(hours=8))

def _get(url):
    for _ in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.loads(r.read().decode("utf-8-sig"))
        except Exception as e:
            print("retry", url, e, file=sys.stderr)
    return None

def twse_closed_reason(d):
    j = _get(f"https://www.twse.com.tw/holidaySchedule/holidaySchedule?response=json&queryYear={d.year}")
    if not j or str(j.get("stat")).upper() != "OK": return None
    for date, name, desc in (r[:3] for r in j.get("data", [])):
        if date == d.isoformat():
            # 「…開始交易日」「…最後交易日」是開市日；其餘（放假、補假、無交易僅結算交割）皆休市
            if "開始交易" in name or "最後交易" in name: return None
            return name.strip()
    return None

def probe_has_data(d):
    """True=有資料 False=確定無資料 None=無法判斷"""
    j = _get(f"https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={d:%Y%m%d}&type=ALLBUT0999&response=json")
    if j is None: return None
    if j.get("stat") == "OK" and j.get("date") == f"{d:%Y%m%d}":
        return any(t.get("data") for t in j.get("tables", []))
    return False

def check(d, probe=True):
    if d.weekday() >= 5: return False, "週末"
    r = twse_closed_reason(d)
    if r: return False, f"證交所休市：{r}"
    if probe and probe_has_data(d) is False: return False, "證交所當日無交易資料（臨時休市或資料未釋出）"
    return True, "開市"

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    d = dt.date.fromisoformat(args[0]) if args else dt.datetime.now(TZ).date()
    ok, why = check(d, probe="--no-probe" not in sys.argv)
    print(f"{d} {'交易日' if ok else '休市'}：{why}")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f: f.write(f"trading={'true' if ok else 'false'}\nreason={why}\n")
