#!/usr/bin/env python3
"""回補全市場每日行情快照（snapshots/YYYY-MM-DD_上市|上櫃.json，格式 {代號:[開,高,低,收,量(股)]}）。
來源：證交所 MI_INDEX（帶日期）、櫃買中心 afterTrading/dailyQuotes（帶日期）。已存在的快照略過，休市日（無資料/日期不符）不寫檔。
用法：python3 scripts/backfill.py 2026-04-15 2026-10-22 [預算秒數]（可中斷、可重複執行：已存在的快照直接略過，從缺的日期繼續）"""
import json, re, sys, time, datetime as dt, pathlib, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent; SNAP = ROOT / "snapshots"
UA = {"User-Agent": "Mozilla/5.0 tw-stock-lab"}; SLEEP = 1.3
CODE = re.compile(r"\d{4}|00\d{3,4}[A-Z]?")

def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r: return json.loads(r.read().decode("utf-8-sig"))
        except Exception as e:
            print("retry", url, e); time.sleep(3 * (i + 1))
    return None

def num(s):
    try: return float(str(s).replace(",", "").replace("+", "").strip())
    except ValueError: return None

def twse(d):
    j = get(f"https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={d:%Y%m%d}&type=ALLBUT0999&response=json")
    if not j or j.get("stat") != "OK" or j.get("date") != f"{d:%Y%m%d}": return None
    t = [t for t in j.get("tables", []) if t.get("fields") and t["fields"][0] == "證券代號"]
    if not t or not t[0].get("data"): return None
    out = {}
    for r in t[0]["data"]:
        c = num(r[8])
        if c is None or not CODE.fullmatch(r[0].strip()): continue
        out[r[0].strip()] = [num(r[5]), num(r[6]), num(r[7]), c, num(r[2])]
    return out

def tpex(d):
    j = get(f"https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date={d:%Y/%m/%d}&type=EW&response=json")
    if not j or not j.get("tables") or not j["tables"][0].get("data"): return None
    t = j["tables"][0]
    if t.get("date", "").replace("/", "") != f"{d.year-1911}{d:%m%d}": return None
    out = {}
    for r in t["data"]:
        c = num(r[2])
        if c is None or not CODE.fullmatch(r[0].strip()): continue
        out[r[0].strip()] = [num(r[4]), num(r[5]), num(r[6]), c, num(r[8])]
    return out

def main(a, b, budget=None):
    """budget：秒數上限（超過就停、已寫入的快照保留，下次同一指令從缺的日期續跑）；None＝不限。"""
    t0 = time.time(); d = a
    while d <= b:
        if budget and time.time() - t0 > budget: print("預算用完，下次續跑從", d, flush=True); return d
        if d.weekday() < 5:
            for mk, fn in (("上市", twse), ("上櫃", tpex)):
                f = SNAP / f"{d.isoformat()}_{mk}.json"
                if f.exists(): continue
                v = fn(d); time.sleep(SLEEP)
                if v: f.write_text(json.dumps(v, ensure_ascii=False)); print(d, mk, len(v), flush=True)
                else: print(d, mk, "無資料（休市或未公布）", flush=True)
        d += dt.timedelta(days=1)

if __name__ == "__main__":
    main(dt.date.fromisoformat(sys.argv[1]), dt.date.fromisoformat(sys.argv[2]), float(sys.argv[3]) if len(sys.argv) > 3 else None)
