#!/usr/bin/env python3
"""判斷指定日期（預設台北今天）台股是否開市；供 daily.yml 在更新前決定是否略過。
1) 週六日 → 休市
2) 證交所「市場開休市日期」表（holidaySchedule）→ 國定假日、補假、春節封關等
3) 以證交所 MI_INDEX 探測當日是否有交易資料（可涵蓋颱風假等臨時休市；網路錯誤時不誤判，視為開市）
用法：python scripts/market_calendar.py [YYYY-MM-DD] [--no-probe]
      python scripts/market_calendar.py --target   （daily.yml 使用：自動決定「目標交易日」）
--target 模式：GitHub Actions 排程常延遲數小時（甚至隔天早上才跑），不能用「執行當下的日期」判斷；
  改成從台北「今天」往回找最近一個證交所已有資料的交易日（最多 10 天）當目標交易日 target。
  若 site/data/stocks.json 已處理過該日（twseDate/tpexDate 皆 ≥ target，且更新時間不早於該日 22:00 台北時間）則略過，否則更新。
輸出 GITHUB_OUTPUT：trading=true|false、reason=...、target=YYYY-MM-DD（--target 模式）；一律 exit 0。"""
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

_HOL = {}
def twse_closed_reason(d):
    if d.year not in _HOL: _HOL[d.year] = _get(f"https://www.twse.com.tw/holidaySchedule/holidaySchedule?response=json&queryYear={d.year}")
    j = _HOL[d.year]
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

def find_target(now, probe=True):
    """從 now 的台北日期往回找最近一個有證交所資料的交易日。回傳 (date|None, 說明)。"""
    d = now.date(); unknown = None
    for _ in range(10):
        ok, why = check(d, probe=False)          # 週末／假日表（不含探測）
        if ok:
            p = probe_has_data(d) if probe else True
            if p: return d, "有證交所資料"
            if p is None and unknown is None: unknown = d    # 無法連線：記下，仍往回找
        d -= dt.timedelta(days=1)
    return unknown, "找不到有資料的交易日"

def already_done(target, stocks_json):
    """stocks.json 是否已在 target 當日 22:00（台北）之後處理過 target。"""
    try:
        m = json.load(open(stocks_json, encoding="utf-8"))["meta"]
        if (m.get("twseDate") or "") < target.isoformat() or (m.get("tpexDate") or "") < target.isoformat(): return False
        upd = dt.datetime.fromisoformat(m["updated"])
        return upd >= dt.datetime.combine(target, dt.time(22, 0), tzinfo=TZ)
    except Exception as e:
        print("already_done 判斷失敗，視為未處理:", e, file=sys.stderr); return False

def emit(**kv):
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            for k, v in kv.items(): f.write(f"{k}={v}\n")

if __name__ == "__main__" and "--target" in sys.argv:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    now = dt.datetime.now(TZ)
    t, why = find_target(now)
    if t is None:
        print(f"{now:%F %H:%M} 找不到目標交易日：{why}"); emit(trading="false", reason=why, target="")
    elif already_done(t, os.path.join(root, "site", "data", "stocks.json")):
        r = f"目標交易日 {t} 已處理過，略過"; print(r); emit(trading="false", reason=r, target=t.isoformat())
    else:
        print(f"{now:%F %H:%M} 目標交易日 {t}（{why}），需要更新"); emit(trading="true", reason=f"目標交易日 {t}", target=t.isoformat())
    sys.exit(0)

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    d = dt.date.fromisoformat(args[0]) if args else dt.datetime.now(TZ).date()
    ok, why = check(d, probe="--no-probe" not in sys.argv)
    print(f"{d} {'交易日' if ok else '休市'}：{why}")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f: f.write(f"trading={'true' if ok else 'false'}\nreason={why}\n")
