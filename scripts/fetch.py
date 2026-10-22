#!/usr/bin/env python3
"""台股研究室 每日資料抓取：只使用證交所 / 櫃買中心官方公開資料，輸出靜態 JSON 至 site/data/。"""
import json, os, time, datetime as dt, urllib.request, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data"; HIS = OUT / "history"; SNAP = ROOT / "snapshots"
for p in (OUT, HIS, SNAP): p.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 tw-stock-lab"}
TOP_N = int(os.environ.get("TOP_N", "30"))          # 每市場依成交金額取前 N 檔建立歷史
MONTHS = int(os.environ.get("MONTHS", "4"))
EXTRA = os.environ.get("EXTRA", "2330,0050,0056,00878,2317,2454,6488,5347,8299,3105").split(",")
SLEEP = float(os.environ.get("SLEEP", "1.3"))

def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.loads(r.read().decode("utf-8-sig"))
        except Exception as e:
            print("retry", url, e); time.sleep(3 * (i + 1))
    return None

def num(s):
    if s is None: return None
    s = str(s).replace(",", "").replace("+", "").strip()
    try: return float(s)
    except ValueError: return None

def roc(s):  # 1151021 or 115/10/21 -> 2026-10-21
    s = s.replace("/", "").strip()
    return f"{int(s[:-4])+1911}-{s[-4:-2]}-{s[-2:]}"

now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec="seconds")
stocks = {}
# --- 上市 ---
twse = get("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL") or []
twse_date = None
for r in twse:
    c = num(r["ClosingPrice"])
    if c is None: continue
    twse_date = roc(r["Date"])
    stocks[r["Code"]] = dict(code=r["Code"], name=r["Name"].strip(), market="上市", etf=r["Code"].startswith("00"),
        date=twse_date, open=num(r["OpeningPrice"]), high=num(r["HighestPrice"]), low=num(r["LowestPrice"]), close=c,
        change=num(r["Change"]), volume=num(r["TradeVolume"]), value=num(r["TradeValue"]), src="證交所")
# --- 上櫃 ---
tpex = get("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes") or []
tpex_date = None
for r in tpex:
    c = num(r["Close"]); code = r["SecuritiesCompanyCode"]
    if c is None or not re.fullmatch(r"\d{4}|00\d{3,4}[A-Z]?", code): continue
    tpex_date = roc(r["Date"])
    stocks[code] = dict(code=code, name=r["CompanyName"].strip(), market="上櫃", etf=code.startswith("00"),
        date=tpex_date, open=num(r["Open"]), high=num(r["High"]), low=num(r["Low"]), close=c,
        change=num(r["Change"]), volume=num(r["TradingShares"]), value=num(r["TransactionAmount"]), src="櫃買中心")

# --- 每日快照累積（供無月歷史的股票逐日累積） ---
for d, mk in ((twse_date, "上市"), (tpex_date, "上櫃")):
    if d:
        (SNAP / f"{d}_{mk}.json").write_text(json.dumps({k: [v["open"], v["high"], v["low"], v["close"], v["volume"]] for k, v in stocks.items() if v["market"] == mk}, ensure_ascii=False))

# --- 三大法人（上市，T86，最近 5 個交易日） ---
inst = {}; inst_dates = []
day = dt.date.fromisoformat(twse_date) if twse_date else dt.date.today()
tries = 0
while len(inst_dates) < 5 and tries < 12:
    tries += 1
    if day.weekday() < 5:
        j = get(f"https://www.twse.com.tw/rwd/zh/fund/T86?date={day:%Y%m%d}&selectType=ALLBUT0999&response=json"); time.sleep(SLEEP)
        if j and j.get("stat") == "OK":
            ds = day.isoformat(); inst_dates.append(ds)
            for r in j["data"]:
                code = r[0].strip()
                f = (num(r[4]) or 0) + (num(r[7]) or 0)
                inst.setdefault(code, []).append(dict(date=ds, foreign=f, trust=num(r[10]), dealer=num(r[11]), total=num(r[18])))
    day -= dt.timedelta(days=1)

# --- 月歷史（STOCK_DAY / TPEx tradingStock） ---
def months_back(n, ref):
    y, m = ref.year, ref.month
    for _ in range(n):
        yield y, m
        m -= 1
        if m == 0: y, m = y - 1, 12

def history(s):
    rows = {}
    ref = dt.date.fromisoformat(s["date"])
    for y, m in months_back(MONTHS, ref):
        if s["market"] == "上市":
            j = get(f"https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date={y}{m:02d}01&stockNo={s['code']}&response=json")
            data = j.get("data", []) if j and j.get("stat") == "OK" else []
            mult = 1  # 股
            for r in data:
                rows[roc(r[0])] = [num(r[3]), num(r[4]), num(r[5]), num(r[6]), num(r[1])]
        else:
            j = get(f"https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code={s['code']}&date={y}/{m:02d}/01&response=json")
            data = j["tables"][0].get("data", []) if j and j.get("tables") else []
            for r in data:  # 成交張數 -> 股
                v = num(r[1]); rows[roc(r[0])] = [num(r[3]), num(r[4]), num(r[5]), num(r[6]), v * 1000 if v is not None else None]
        time.sleep(SLEEP)
    # 合併累積快照
    for f in SNAP.glob(f"*_{s['market']}.json"):
        d = f.name[:10]
        if d not in rows:
            v = json.loads(f.read_text()).get(s["code"])
            if v: rows[d] = v
    return [[d] + rows[d] for d in sorted(rows) if rows[d][3] is not None]

def sma(arr, n): return round(sum(arr[-n:]) / n, 2) if len(arr) >= n else None

def levels(h, close):
    """支撐壓力價格帶：波段高低點(左右各3根) + 經典樞紐點(P,S1,S2,R1,R2) + MA20/MA60，候選價位相距 1.5% 內合併為價格帶。"""
    h = h[-120:]; cands = []
    for i in range(3, len(h) - 3):
        hi, lo = h[i][2], h[i][3]
        if all(hi >= h[k][2] for k in range(i-3, i+4)): cands.append((hi, "波段高點", h[i][0]))
        if all(lo <= h[k][3] for k in range(i-3, i+4)): cands.append((lo, "波段低點", h[i][0]))
    H, L, C = h[-1][2], h[-1][3], h[-1][4]; P = (H + L + C) / 3
    for v, n in ((P, "樞紐 P"), (2*P-H, "樞紐 S1"), (P-(H-L), "樞紐 S2"), (2*P-L, "樞紐 R1"), (P+(H-L), "樞紐 R2")):
        cands.append((round(v, 2), n, h[-1][0]))
    cl = [x[4] for x in h]
    for n in (20, 60):
        m = sma(cl, n)
        if m: cands.append((m, f"MA{n}", h[-1][0]))
    def bands(cs):
        cs = sorted(cs); cl = []
        for c in cs:
            if cl and c[0] <= cl[-1][0][0] * 1.015: cl[-1].append(c)
            else: cl.append([c])
        return [dict(low=round(min(x[0] for x in g), 2), high=round(max(x[0] for x in g), 2), n=len(g),
                     basis=sorted({x[1] for x in g}), last=max(x[2] for x in g)) for g in cl]
    sup = sorted(bands([c for c in cands if c[0] < close]), key=lambda b: -b["high"])[:2]
    res = sorted(bands([c for c in cands if c[0] > close]), key=lambda b: b["low"])[:2]
    return dict(support=sup, resistance=res)

ranked = []
for mk in ("上市", "上櫃"):
    pool = sorted([s for s in stocks.values() if s["market"] == mk], key=lambda s: -(s["value"] or 0))
    ranked += [s["code"] for s in pool[:TOP_N]]
targets = list(dict.fromkeys([c for c in EXTRA if c in stocks] + ranked))
print("history targets", len(targets))
for i, code in enumerate(targets):
    s = stocks[code]; h = history(s)
    if not h: continue
    cl = [x[4] for x in h]; vol = [x[5] or 0 for x in h]
    avg5 = sum(vol[-6:-1]) / 5 if len(vol) >= 6 else None
    out = dict(code=code, name=s["name"], market=s["market"], src=s["src"], date=h[-1][0], updated=now,
               rows=h, ma5=sma(cl, 5), ma20=sma(cl, 20), ma60=sma(cl, 60),
               volRatio=round(vol[-1] / avg5, 2) if avg5 else None, levels=levels(h, cl[-1]) if len(h) >= 10 else None,
               method="波段高低點(左右各3日)+樞紐點+MA20/60，1.5%內合併為價格帶")
    (HIS / f"{code}.json").write_text(json.dumps(out, ensure_ascii=False))
    s["hasHistory"] = True
    print(i + 1, code, len(h))

meta = dict(updated=now, twseDate=twse_date, tpexDate=tpex_date, instDates=inst_dates,
            counts=dict(twse=sum(1 for s in stocks.values() if s["market"] == "上市"), tpex=sum(1 for s in stocks.values() if s["market"] == "上櫃")),
            sources=dict(twse="https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", tpex="https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
                         inst="https://www.twse.com.tw/rwd/zh/fund/T86", twseHist="https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY",
                         tpexHist="https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock"))
(OUT / "stocks.json").write_text(json.dumps(dict(meta=meta, stocks=list(stocks.values())), ensure_ascii=False))
(OUT / "institutional.json").write_text(json.dumps(dict(dates=inst_dates, src="證交所 T86", data=inst), ensure_ascii=False))
print("done", meta)
