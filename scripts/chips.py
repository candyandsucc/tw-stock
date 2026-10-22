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
    if not j or j.get("stat") != "OK": return None
    return {r[0].strip(): [round((num(r[4]) or 0) + (num(r[7]) or 0)), num(r[10]), num(r[11])] for r in j["data"]}

def tpex_inst(d):
    j = get(f"https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?type=Daily&sect=EW&date={d.replace('-','/')}&response=json")
    if not j or not j.get("tables") or not j["tables"][0].get("data"): return None
    # 欄位：外資及陸資合計[10]、投信[13]、自營商合計[22]
    return {r[0].strip(): [num(r[10]), num(r[13]), num(r[22])] for r in j["tables"][0]["data"]}

# ---- 融資（單位：張）：今日餘額、前日餘額 ----
def twse_margin(d):
    j = get(f"https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={d.replace('-','')}&selectType=ALL&response=json")
    if not j or j.get("stat") != "OK": return None
    t = [t for t in j["tables"] if t.get("fields") and t["fields"][0] == "代號"]
    if not t or not t[0]["data"]: return None
    return {r[0].strip(): [num(r[6]), num(r[5])] for r in t[0]["data"]}

def tpex_margin(d):
    j = get(f"https://www.tpex.org.tw/www/zh-tw/margin/balance?date={d.replace('-','/')}&response=json")
    if not j or not j.get("tables") or not j["tables"][0].get("data"): return None
    return {r[0].strip(): [num(r[6]), num(r[2])] for r in j["tables"][0]["data"]}

YUANTA = [("0050","元大台灣50"),("0051","元大中型100"),("0053","元大電子"),("0055","元大MSCI金融"),("0056","元大高股息"),
          ("006203","元大MSCI台灣"),("00713","元大台灣高息低波"),("00850","元大臺灣ESG永續"),("00940","元大台灣價值高息")]
CAPITAL = [("00919","群益台灣精選高息","195"),("00982A","主動群益台灣強棒","399")]

def yuanta(code):
    # urllib 對此站會卡住，改用 curl
    try: html = subprocess.run(["curl", "-s", "--max-time", "60", "-A", "Mozilla/5.0", f"https://www.yuantaetfs.com/product/detail/{code}/ratio"], capture_output=True, text=True, timeout=90).stdout
    except Exception: html = None
    if not html: return None
    try:
        out = subprocess.run(["node", str(ROOT / "scripts" / "yuanta_parse.js")], input=html, capture_output=True, text=True, timeout=60).stdout
        j = json.loads(out); return None if j.get("error") else j
    except Exception as e:
        print("yuanta parse", code, e); return None

def capital(fid, date=None):
    j = get("https://www.capitalfund.com.tw/CFWeb/api/etf/buyback", {"fundId": fid, "date": date})
    if not j or j.get("code") != 200: return None
    d = j["data"]; base = d["pcf"]["date2"]  # PCF 申購買回清單依前一營業日收盤持股編製
    return dict(date=base, holdings=[dict(code=s["stocNo"].strip(), name=s["stocName"], shares=s["share"], weight=s["weight"]) for s in d.get("stocks", [])])

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
    for f in CACHE.glob("*.json"):
        if f.name.split("_")[1] not in keep: f.unlink()

def etfdata():
    funds = []
    for code, name in YUANTA:
        cur = yuanta(code); time.sleep(SLEEP)
        prev = None
        if cur:
            (ETFS / f"{code}_{cur['date']}.json").write_text(json.dumps(cur, ensure_ascii=False, separators=(",", ":")))
            older = sorted(f for f in ETFS.glob(f"{code}_*.json") if f.name[len(code)+1:-5] < cur["date"])
            if older: prev = json.loads(older[-1].read_text())
            for f in older[:-3]: f.unlink()
        funds.append(dict(code=code, name=name, issuer="元大投信", url=f"https://www.yuantaetfs.com/product/detail/{code}/ratio", cur=cur, prev=prev))
    for code, name, fid in CAPITAL:
        cur = capital(fid); time.sleep(SLEEP)
        prev = capital(fid, cur["date"]) if cur else None; time.sleep(SLEEP)
        funds.append(dict(code=code, name=name, issuer="群益投信", url=f"https://www.capitalfund.com.tw/etf/product/detail/{fid}/portfolio", cur=cur, prev=prev))
    hold = {}
    for f in funds:
        if not f["cur"]: continue
        cm = {h["code"]: h for h in f["cur"]["holdings"]}; pm = {h["code"]: h for h in f["prev"]["holdings"]} if f["prev"] else None
        for c in set(cm) | set(pm or {}):
            r, p = cm.get(c), (pm or {}).get(c)
            hold.setdefault(c, []).append(dict(fund=f["code"], shares=r["shares"] if r else 0, weight=r["weight"] if r else 0,
                prevShares=(p["shares"] if p else 0) if pm is not None else None, prevWeight=(p["weight"] if p else 0) if pm is not None else None))
    etf = dict(funds=[dict(code=f["code"], name=f["name"], issuer=f["issuer"], url=f["url"], ok=bool(f["cur"]),
                           date=f["cur"]["date"] if f["cur"] else None, prevDate=f["prev"]["date"] if f["prev"] else None,
                           n=len(f["cur"]["holdings"]) if f["cur"] else 0) for f in funds], holdings=hold)
    (OUT / "etf.json").write_text(json.dumps(etf, ensure_ascii=False, separators=(",", ":")))
    print("etf done", [(f["code"], f["cur"] and f["cur"]["date"]) for f in funds])

if __name__ == "__main__":
    import sys; main(only_etf="--etf" in sys.argv)
