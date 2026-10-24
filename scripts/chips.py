"""籌碼與延伸資料：產業別、三大法人近 20 日、融資、ETF 持股。只用官方（證交所/櫃買中心）與 ETF 發行投信公開資料。
已抓過的歷史交易日資料快取在 snapshots/ 下，每天只需補抓新交易日，對來源友善。"""
import json, time, subprocess, urllib.request, pathlib, datetime as dt
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data"; HIS = OUT / "history"; CACHE = ROOT / "snapshots" / "chips"; ETFS = ROOT / "snapshots" / "etf"
for p in (CACHE, ETFS): p.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 tw-stock-lab"}
SLEEP = 1.3

def raw(url, data=None, tries=3):
    for i in range(tries):
        try:
            h = dict(UA)
            if data is not None: h["Content-Type"] = "application/json"
            req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None, headers=h)
            with urllib.request.urlopen(req, timeout=60) as r: return r.read().decode("utf-8-sig")
        except Exception as e:
            print("retry", url, e); time.sleep(3 * (i + 1))
    return None

def get(url, data=None):
    t = raw(url, data)
    try: return json.loads(t) if t else None
    except Exception: return None

def num(s):
    if s is None: return None
    s = str(s).replace(",", "").replace("+", "").strip()
    try: return float(s)
    except ValueError: return None

def cached(name, fetch):
    f = CACHE / name
    if f.exists(): return json.loads(f.read_text())
    v = fetch(); time.sleep(SLEEP)
    if v is not None: f.write_text(json.dumps(v, ensure_ascii=False, separators=(",", ":")))
    return v

# ---- 三大法人（單位：股；外資含外資自營商） ----
def twse_inst(d):
    j = get(f"https://www.twse.com.tw/rwd/zh/fund/T86?date={d.replace('-','')}&selectType=ALLBUT0999&response=json")
    if not j or j.get("stat") != "OK" or j.get("date") != d.replace("-", ""): return None
    return {r[0].strip(): [round((num(r[4]) or 0) + (num(r[7]) or 0)), num(r[10]), num(r[11])] for r in j["data"]}

def tpex_inst(d):
    j = get(f"https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?type=Daily&sect=EW&date={d.replace('-','/')}&response=json")
    if not j or not j.get("tables") or not j["tables"][0].get("data"): return None
    # 欄位：外資及陸資合計[10]、投信[13]、自營商合計[22]
    return {r[0].strip(): [num(r[10]), num(r[13]), num(r[22])] for r in j["tables"][0]["data"]}

# ---- 融資（單位：張）：今日餘額、前日餘額 ----
def twse_margin(d):
    j = get(f"https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={d.replace('-','')}&selectType=ALL&response=json")
    if not j or j.get("stat") != "OK" or j.get("date") != d.replace("-", ""): return None
    t = [t for t in j["tables"] if t.get("fields") and t["fields"][0] == "代號"]
    if not t or not t[0]["data"]: return None
    return {r[0].strip(): [num(r[6]), num(r[5])] for r in t[0]["data"]}

def tpex_margin(d):
    j = get(f"https://www.tpex.org.tw/www/zh-tw/margin/balance?date={d.replace('-','/')}&response=json")
    if not j or not j.get("tables") or not j["tables"][0].get("data"): return None
    return {r[0].strip(): [num(r[6]), num(r[2])] for r in j["tables"][0]["data"]}

def main(only_etf=False):
    S = json.loads((OUT / "stocks.json").read_text()); stocks = {s["code"]: s for s in S["stocks"]}
    if not only_etf: chipdata(S, stocks)
    etfdata()

def chipdata(S, stocks):
    # 產業別
    tw = get("https://openapi.twse.com.tw/v1/opendata/t187ap03_L") or []
    tp = get("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O") or []
    for r in tw:
        s = stocks.get(r["公司代號"].strip())
        if s and s["market"] == "上市": s["ind"] = r["產業別"].strip()
    for r in tp:
        s = stocks.get(r["SecuritiesCompanyCode"].strip())
        if s and s["market"] == "上櫃": s["ind"] = r["SecuritiesIndustryCode"].strip()
    S["meta"]["sources"].update(indTwse="https://openapi.twse.com.tw/v1/opendata/t187ap03_L", indTpex="https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O")
    (OUT / "stocks.json").write_text(json.dumps(S, ensure_ascii=False))

    # 交易日：取 2330 日線（證交所）最近 20 日
    days = [r[0] for r in json.loads((HIS / "2330.json").read_text())["rows"]][-20:]
    latest = S["meta"]["twseDate"]
    if latest and latest not in days: days = (days + [latest])[-20:]
    inst = {"上市": {}, "上櫃": {}}; got = {"上市": [], "上櫃": []}
    for d in days:
        for mk, fn in (("上市", twse_inst), ("上櫃", tpex_inst)):
            v = cached(f"inst_{d}_{mk}.json", lambda: fn(d))
            if v is None: continue
            got[mk].append(d); i = len(days)
            for code, x in v.items():
                inst[mk].setdefault(code, {})[d] = x
    instOut = {}
    for mk in inst:
        for code, m in inst[mk].items():
            instOut[code] = [m.get(d) for d in days]
    mdays = days[-6:]; margin = {}; mgot = []
    for d in mdays:
        for mk, fn in (("上市", twse_margin), ("上櫃", tpex_margin)):
            v = cached(f"margin_{d}_{mk}.json", lambda: fn(d))
            if v is None: continue
            if d not in mgot: mgot.append(d)
            for code, x in v.items(): margin.setdefault(code, {})[d] = x
    marginOut = {c: [m.get(d) for d in mdays] for c, m in margin.items()}
    chips = dict(days=days, instGot=got, marginDays=mdays, marginGot=mgot, inst=instOut, margin=marginOut,
                 sources=dict(instTwse="https://www.twse.com.tw/rwd/zh/fund/T86", instTpex="https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade",
                              marginTwse="https://www.twse.com.tw/zh/trading/margin/mi-margn.html", marginTpex="https://www.tpex.org.tw/zh-tw/mainboard/trading/margin-trading/transactions.html"))
    (OUT / "chips.json").write_text(json.dumps(chips, ensure_ascii=False, separators=(",", ":")))
    print("chips done", days[-1], got["上市"][-1:], got["上櫃"][-1:], mgot)
    # 清除超過 30 個交易日的快取
    keep = set(days)
    for f in list(CACHE.glob("inst_*.json")) + list(CACHE.glob("margin_*.json")):   # 只清自己的快取（crm/crs/crq 由 extra.py 管理）
        if f.name.split("_")[1] not in keep: f.unlink()

def etfdata():
    # ETF 持股改由 etf.py 處理（多投信、單檔失敗不中斷、失敗時標示原因）
    try:
        import etf; etf.main()
    except Exception as e: print("etf 失敗（保留前次資料）:", e)

if __name__ == "__main__":
    import sys; main(only_etf="--etf" in sys.argv)
