#!/usr/bin/env python3
"""延伸官方資料：休市日程、處置／注意／全額交割標記、信用交易（融資融券借券）、外資持股比率。
只用證交所／櫃買中心官方公開資料；每一項獨立 try/except，單項失敗只保留前次資料並印出原因，不影響 daily workflow。
用法：python3 scripts/extra.py [calendar|flags|credit|all]"""
import json, re, sys, time, pathlib, datetime as dt, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data"; CACHE = ROOT / "snapshots" / "chips"; HIS = OUT / "history"
CACHE.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 tw-stock-lab"}; SLEEP = 1.3
TZ = dt.timezone(dt.timedelta(hours=8))

def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.loads(r.read().decode("utf-8-sig"))
        except Exception as e:
            print("retry", url, e); time.sleep(2 * (i + 1))
    return None

def num(s):
    if s is None: return None
    s = str(s).replace(",", "").replace("+", "").replace("%", "").strip()
    try: return float(s)
    except ValueError: return None

def roc8(s):  # 1151022 -> 2026-10-22
    s = str(s).replace("/", "").replace(".", "").strip()
    return f"{int(s[:-4]) + 1911}-{s[-4:-2]}-{s[-2:]}" if len(s) >= 6 else None

def now(): return dt.datetime.now(TZ)

def wjson(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))

# ============ 1. 休市日程 ============
def calendar():
    """證交所 OpenAPI holidaySchedule（休市日程）＋ 近 14 個平日的當日無資料探測（臨時休市，標為「推定」）。輸出 calendar.json。"""
    j = get("https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule")
    old = {}
    try: old = json.loads((OUT / "calendar.json").read_text())
    except Exception: pass
    if not j:
        if old: print("calendar: 取不到，保留前次"); return
        raise RuntimeError("holidaySchedule 取不到")
    closed = {}; open_marks = {}
    for r in j:
        d = roc8(r["Date"]); name = r["Name"].strip()
        if not d: continue
        if "開始交易" in name or "最後交易" in name: open_marks[d] = name; continue   # 這兩種是開市日
        closed[d] = name
    # 臨時休市（颱風等）：平日、不在休市日程，但證交所該日無任何交易資料 → 標示為推定
    temp = dict(old.get("temp") or {}); checked = set(old.get("checked") or [])
    for k in range(1, 15):
        d = now().date() - dt.timedelta(days=k)
        if d.weekday() >= 5 or d.isoformat() in closed or d.isoformat() in temp or d.isoformat() in checked: continue
        mi = get(f"https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={d:%Y%m%d}&type=ALLBUT0999&response=json", tries=2); time.sleep(SLEEP)
        if mi is None: continue
        if not (mi.get("stat") == "OK" and mi.get("date") == f"{d:%Y%m%d}" and any(t.get("data") for t in mi.get("tables", []))):
            temp[d.isoformat()] = "臨時休市（證交所無交易資料，推定）"
        else: checked.add(d.isoformat())
    temp = {d: n for d, n in temp.items() if d >= (now().date() - dt.timedelta(days=400)).isoformat()}
    wjson("calendar.json", dict(updated=now().isoformat(timespec="seconds"), years=sorted({d[:4] for d in closed}),
          closed=dict(sorted(closed.items())), temp=temp, checked=sorted(checked)[-60:], openMarks=open_marks,
          source="https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule", note="臨時休市為平日不在休市日程、且證交所 MI_INDEX 該日無資料時推定"))
    print("calendar ok", len(closed), "closed;", "temp", list(temp))

def main(which="all"):
    steps = dict(calendar=calendar)
    for k, fn in steps.items():
        if which in ("all", k):
            try: fn()
            except Exception as e: print(f"extra.{k} 失敗（保留前次資料）：{type(e).__name__}: {e}")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "all")
