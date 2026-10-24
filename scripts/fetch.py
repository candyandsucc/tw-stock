#!/usr/bin/env python3
"""台股研究室 每日資料抓取：只使用證交所 / 櫃買中心官方公開資料，輸出靜態 JSON 至 site/data/。"""
import json, os, time, datetime as dt, urllib.request, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data"; HIS = OUT / "history"; SNAP = ROOT / "snapshots"
for p in (OUT, HIS, SNAP): p.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 tw-stock-lab"}
TOP_N = int(os.environ.get("TOP_N", "30"))          # 每市場依成交金額取前 N 檔建立歷史
MONTHS = int(os.environ.get("MONTHS", "6"))
EXTRA = os.environ.get("EXTRA", "2330,0050,0056,00878,2317,2454,6488,5347,8299,3105,8046,2449,2344").split(",")
SLEEP = float(os.environ.get("SLEEP", "1.3"))
# 自選 25 檔（site/data/watchlist.json）固定納入每日歷史抓取；ONLY=代號,代號 可只補抓指定股票（補資料／測試用）
try: WATCH = json.loads((OUT / "watchlist.json").read_text(encoding="utf-8"))["codes"]
except Exception: WATCH = []
ONLY = [c for c in os.environ.get("ONLY", "").split(",") if c]

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
# 優先用帶日期參數的 MI_INDEX（盤後即時），並核對回應日期；OpenAPI STOCK_DAY_ALL 常延遲一天，僅作備援
twse_date = None
_d = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
for _ in range(7):
    if _d.weekday() < 5:
        j = get(f"https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={_d:%Y%m%d}&type=ALLBUT0999&response=json"); time.sleep(SLEEP)
        if j and j.get("stat") == "OK" and j.get("date") == f"{_d:%Y%m%d}":
            t = [t for t in j.get("tables", []) if t.get("fields") and t["fields"][0] == "證券代號"]
            if t and t[0].get("data"):
                twse_date = _d.isoformat()
                for r in t[0]["data"]:
                    c = num(r[8])
                    if c is None: continue
                    sign = -1 if "-" in re.sub(r"<[^>]+>", "", r[9]) or "green" in r[9] else 1
                    ch = num(r[10]); ch = sign * ch if ch is not None else None
                    stocks[r[0].strip()] = dict(code=r[0].strip(), name=r[1].strip(), market="上市", etf=r[0].startswith("00"), date=twse_date,
                        open=num(r[5]), high=num(r[6]), low=num(r[7]), close=c, change=ch, volume=num(r[2]), value=num(r[4]), src="證交所")
                break
    _d -= dt.timedelta(days=1)
if not twse_date:
    for r in get("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL") or []:
        c = num(r["ClosingPrice"])
        if c is None: continue
        twse_date = roc(r["Date"])
        stocks[r["Code"]] = dict(code=r["Code"], name=r["Name"].strip(), market="上市", etf=r["Code"].startswith("00"),
            date=twse_date, open=num(r["OpeningPrice"]), high=num(r["HighestPrice"]), low=num(r["LowestPrice"]), close=c,
            change=num(r["Change"]), volume=num(r["TradeVolume"]), value=num(r["TradeValue"]), src="證交所")
print("twse date", twse_date, sum(1 for v in stocks.values() if v["market"] == "上市"))
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
        if j and j.get("stat") == "OK" and j.get("date") == f"{day:%Y%m%d}":
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

import sys as _s; _s.path.insert(0, str(ROOT / "scripts"))
from levels import compute as _lv
def levels(h, close): return _lv(h, close)

ranked = []
for mk in ("上市", "上櫃"):
    pool = sorted([s for s in stocks.values() if s["market"] == mk], key=lambda s: -(s["value"] or 0))
    ranked += [s["code"] for s in pool[:TOP_N]]
targets = list(dict.fromkeys([c for c in EXTRA + WATCH if c in stocks] + ranked))
if ONLY: targets = [c for c in ONLY if c in stocks]
print("history targets", len(targets))
import adjust, patterns
_ref = dt.date.fromisoformat(twse_date or tpex_date)
EVENTS = adjust.events(_ref - dt.timedelta(days=31 * MONTHS), _ref, SLEEP)   # 重大除權（參考價/前收 ≤ 0.9）
print("major ex-rights in window:", {c: [(e[0], e[1]) for e in v] for c, v in EVENTS.items() if c in targets})
for i, code in enumerate(targets):
    s = stocks[code]; h = history(s)
    if not h: continue
    adj = []
    if code in EVENTS: h, adj = adjust.apply(h, EVENTS[code])   # 除權還原（均線／支撐壓力皆用還原價）
    cl = [x[4] for x in h]; vol = [x[5] or 0 for x in h]
    avg5 = sum(vol[-20:]) / 20 if len(vol) >= 20 else None  # 近 20 日均量（含當日）
    out = dict(code=code, name=s["name"], market=s["market"], src=s["src"], date=h[-1][0], updated=now,
               rows=h, ma5=sma(cl, 5), ma20=sma(cl, 20), ma60=sma(cl, 60),
               volRatio=round(vol[-1] / avg5, 2) if avg5 else None, levels=levels(h, cl[-1]) if len(h) >= 10 else None,
               method="結構法", adjusted=adj or None, patterns=patterns.detect(h, cl[-1]))
    (HIS / f"{code}.json").write_text(json.dumps(out, ensure_ascii=False))
    s["hasHistory"] = True
    print(i + 1, code, len(h))

# --- 擴大技術分析涵蓋：成交值前 400 檔一般股，由每日全市場快照（MI_INDEX／dailyQuotes）建立歷史，不逐檔呼叫 STOCK_DAY ---
import universe
universe.main(stocks, EVENTS, now, skip=set(targets), prune=not ONLY)

for _c, _s in stocks.items():  # 歷史檔已存在者一律標記（ONLY 補抓時不會遺失其他股票旗標）
    if (HIS / f"{_c}.json").exists(): _s["hasHistory"] = True
meta = dict(updated=now, twseDate=twse_date, tpexDate=tpex_date, instDates=inst_dates,
            counts=dict(twse=sum(1 for s in stocks.values() if s["market"] == "上市"), tpex=sum(1 for s in stocks.values() if s["market"] == "上櫃")),
            sources=dict(twse="https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX", tpex="https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
                         inst="https://www.twse.com.tw/rwd/zh/fund/T86", twseHist="https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY",
                         tpexHist="https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock"))
(OUT / "stocks.json").write_text(json.dumps(dict(meta=meta, stocks=list(stocks.values())), ensure_ascii=False))
(OUT / "institutional.json").write_text(json.dumps(dict(dates=inst_dates, src="證交所 T86", data=inst), ensure_ascii=False))
print("done", meta)

# --- 產業別、三大法人近 20 日（上市+上櫃）、融資、ETF 持股 ---
import sys; sys.path.insert(0, str(ROOT / "scripts"))
import chips; chips.main()
import extra; extra.main()      # 休市日程、處置注意標記、信用交易、外資持股比率（各項獨立失敗不影響其他）

import summary; summary.main()   # 自選 25 檔一頁式總覽（site/data/watch25.json）
import analytics; analytics.main()  # 情境篩選／位階／風險檢查（site/data/screen.json）
import fundamentals                 # 本益比／殖利率／淨值比、近 12 個月月營收（site/data/fund.json、rev.json）
try: fundamentals.main()
except Exception as e: print("fundamentals failed（保留前次資料）:", e)
