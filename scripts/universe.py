"""擴大技術分析涵蓋範圍：由每日全市場快照（snapshots/*_上市|上櫃.json，證交所 MI_INDEX／櫃買中心 dailyQuotes）
為「近 20 日成交值前 TOP 檔」的一般股票建立歷史檔（site/data/history/<代號>.json），不需逐檔呼叫 STOCK_DAY。
排名＝近 20 日（收盤×成交股數）加總，上市＋上櫃合併，排除 ETF；歷史不足 MIN_ROWS 日者略過。"""
import json, re, pathlib, datetime as dt
ROOT = pathlib.Path(__file__).resolve().parent.parent
SNAP = ROOT / "snapshots"; HIS = ROOT / "site" / "data" / "history"
TOP = 400; DAYS = 300; MIN_ROWS = 60   # DAYS：每檔保留的交易日數（52 週高低與 MA200 需 ≥ 260）

def load_snaps(days=DAYS):
    ds = sorted({f.name[:10] for f in SNAP.glob("????-??-??_*.json")})[-days:]
    out = []
    for d in ds:
        m = {}
        for mk in ("上市", "上櫃"):
            f = SNAP / f"{d}_{mk}.json"
            if f.exists():
                for c, v in json.loads(f.read_text()).items(): m[c] = (mk, v)
        out.append((d, m))
    return out

def ranking(snaps, top=TOP):
    tot = {}
    for d, m in snaps[-20:]:
        for c, (mk, v) in m.items():
            if re.fullmatch(r"\d{4}", c) and v[3] and v[4]: tot[c] = tot.get(c, 0) + v[3] * v[4]
    return [c for c, _ in sorted(tot.items(), key=lambda x: -x[1])[:top]]

def rows_of(code, snaps):
    rows = []
    for d, m in snaps:
        if code in m:
            o, h, l, c, v = m[code][1]
            if c is None: continue
            rows.append([d, o if o else c, h if h else c, l if l else c, c, v or 0])
    return rows

def main(stocks, events, now, skip=(), prune=True):
    import adjust, patterns
    from levels import compute as levels
    snaps = load_snaps()
    if not snaps: return []
    latest = snaps[-1][0]; rank = ranking(snaps); built = []
    for code in rank:
        if code in skip or code not in stocks: continue
        h = rows_of(code, snaps)
        if len(h) < MIN_ROWS or h[-1][0] != stocks[code]["date"]: continue
        s = stocks[code]; adj = []
        if code in events: h, adj = adjust.apply(h, events[code])
        cl = [x[4] for x in h]; vol = [x[5] or 0 for x in h]
        sma = lambda n: round(sum(cl[-n:]) / n, 2) if len(cl) >= n else None
        avg = sum(vol[-20:]) / 20 if len(vol) >= 20 else None
        out = dict(code=code, name=s["name"], market=s["market"], src=s["src"], date=h[-1][0], updated=now, rows=h,
                   ma5=sma(5), ma20=sma(20), ma60=sma(60), volRatio=round(vol[-1] / avg, 2) if avg else None,
                   levels=levels(h, cl[-1]) if len(h) >= 10 else None, method="結構法", adjusted=adj or None,
                   patterns=patterns.detect(h, cl[-1]), histSource="全市場每日收盤快照（證交所 MI_INDEX／櫃買中心 dailyQuotes）")
        (HIS / f"{code}.json").write_text(json.dumps(out, ensure_ascii=False))
        stocks[code]["hasHistory"] = True; built.append(code)
    if prune:  # 清掉已不在涵蓋範圍、且資料日落後的舊歷史檔
        keep = set(rank) | set(skip)
        for f in HIS.glob("*.json"):
            if f.stem not in keep:
                try: d = json.loads(f.read_text()).get("date")
                except Exception: d = None
                if d != latest: f.unlink(); stocks.get(f.stem, {}).pop("hasHistory", None)
    print("universe built", len(built), "of rank", len(rank), "latest", latest)
    return built
