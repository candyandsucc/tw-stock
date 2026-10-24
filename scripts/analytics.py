#!/usr/bin/env python3
"""情境篩選／風險檢查／位階分級：由 site/data/history/*.json（收盤價量）與 chips.json（三大法人、融資）自行計算，不連網。
輸出 site/data/screen.json。全部是「資料分類與觀察」，不是買賣建議；門檻為本站自訂，列在 screen.json 的 defs 並顯示於頁面。"""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent; D = ROOT / "site" / "data"

LIFE = 20   # 生命線＝MA20（月線）
TH = dict(
    drop=20.0, dropWin=60, recross=7,          # 跌深反彈：近 60 日自高點回落 ≥20%，且 ≤7 日內由線下站回
    fgn=3, vol=1.5, shadow=0.30,               # 外資連買 ≥3 日；量比 ≥1.5；上影線 ≤ 當日振幅 30%
    stable=30,                                  # 站穩轉強：連續站上生命線 ≥30 日 ＋ MA5>MA20>MA60
    inst=3,                                     # 法人連買 ≥3 日
    tiers=[0, 3, 10, 20],                       # 乖離 <0 線下整理；0–3 剛站回；3–10 爬坡中；10–20 噴出中；≥20 已飛天
    jump10=20.0, jumpBias=20.0,                 # 噴出段：近 10 日漲幅 ≥20% 或乖離生命線 ≥20%
    gap=3, gapWin=10,                           # 三跳空：近 10 日同方向跳空 ≥3 次
    divWin=3, divVol=0.8,                       # 量價背離：近 3 日收盤創 20 日新高、量 < 前一個波段高點當日量 ×0.8
    marginPct=20.0, marginMin=500,              # 融資暴增：5 日增幅 ≥20% 且 ≥500 張
)
TIERS = ["線下整理", "剛站回", "爬坡中", "噴出中", "已飛天"]
SCEN = [
    dict(id="rebound", name="跌深反彈", short="近60日自高點回落≥20%，且7日內站回生命線",
         rule=f"近 {TH['dropWin']} 日最高收盤至其後最低收盤的跌幅 ≥ {TH['drop']:.0f}%，且目前收盤在生命線（MA{LIFE}）之上、並在最近 {TH['recross']} 個交易日內由線下站回。"),
    dict(id="foreign", name="外資撐腰", short="外資連買≥3日且剛站回",
         rule=f"外資（含陸資、外資自營商）連續買超 ≥ {TH['fgn']} 個交易日（含最新日，來源證交所 T86／櫃買中心），且「剛站回」生命線（≤1 日內）。"),
    dict(id="volume", name="量能起飛", short="紅K、量比≥1.5、收盤上漲、無長上影",
         rule=f"當日收盤 > 開盤（紅K）且收盤 > 前收；量比（最新日量 ÷ 近 20 日均量，含當日）≥ {TH['vol']}；上影線（最高−max(開,收)）≤ 當日振幅 {TH['shadow']*100:.0f}%。"),
    dict(id="stable", name="站穩轉強", short="站穩生命線≥30日且MA5>MA20>MA60",
         rule=f"連續 ≥ {TH['stable']} 個交易日收盤在當日生命線（MA{LIFE}）之上，且 MA5 > MA20 > MA60（三線多頭排列）。連續日數只計算本站已有的歷史範圍。"),
    dict(id="fresh", name="剛站回", short="≤1日內站回生命線",
         rule=f"最新收盤在生命線（MA{LIFE}）之上，且前一個交易日收盤在生命線之下或持平（≤1 日內由線下站回）。"),
    dict(id="inst", name="法人連買", short="外資／投信／自營商其一連買≥3日",
         rule=f"外資、投信、自營商三者任一連續買超 ≥ {TH['inst']} 個交易日（含最新日；官方未列入的日期視為中斷）。"),
]
TIER_RULE = f"乖離＝收盤 ÷ 生命線（MA{LIFE}）− 1。線下整理：乖離 < 0%；剛站回：0～{TH['tiers'][1]}%；爬坡中：{TH['tiers'][1]}～{TH['tiers'][2]}%；噴出中：{TH['tiers'][2]}～{TH['tiers'][3]}%；已飛天：≥ {TH['tiers'][3]}%。門檻為本站自訂。位階的「剛站回」只看乖離（0～3%），與上方快速情境「剛站回」（≤1 日內由線下站回）不同。"
RISK = [
    dict(id="jump", name="噴出段", rule=f"近 10 個交易日漲幅 ≥ {TH['jump10']:.0f}%，或收盤乖離生命線（MA{LIFE}）≥ {TH['jumpBias']:.0f}%。"),
    dict(id="gap", name="三跳空", rule=f"近 {TH['gapWin']} 個交易日內，同方向跳空（今日最低 > 前日最高，或今日最高 < 前日最低）≥ {TH['gap']} 次。"),
    dict(id="div", name="量價背離", rule=f"近 {TH['divWin']} 日內有收盤創近 20 日新高，且該日成交量 < 前一個波段高點（近 60 日、前後各 2 日確認的收盤高點）當日量的 {TH['divVol']*100:.0f}%。"),
    dict(id="margin", name="融資暴增", rule=f"融資餘額 5 個交易日增幅 ≥ {TH['marginPct']:.0f}% 且增加 ≥ {TH['marginMin']} 張（排除基數很小者）。來源證交所 MI_MARGN／櫃買中心融資融券餘額。"),
]

def streak_above(cl, ma):
    n = 0
    for i in range(len(cl) - 1, -1, -1):
        if ma[i] is not None and cl[i] > ma[i]: n += 1
        else: break
    return n

def consec(vals):
    n = 0
    for v in reversed(vals):
        if v is not None and v > 0: n += 1
        else: break
    return n

def analyze(h, inst, marg):
    rows = h["rows"]; n = len(rows)
    if n < 25: return None
    o = [r[1] for r in rows]; hi = [r[2] for r in rows]; lo = [r[3] for r in rows]; cl = [r[4] for r in rows]; vol = [r[5] or 0 for r in rows]
    ma = lambda k: [None] * (k - 1) + [sum(cl[i - k + 1:i + 1]) / k for i in range(k - 1, n)]
    m20, m5, m60 = ma(LIFE), ma(5), ma(60) if n >= 60 else [None] * n
    life = m20[-1]; close = cl[-1]; bias = (close / life - 1) * 100
    st = streak_above(cl, m20)
    crossed = 0 < st < n - (LIFE - 1)          # 連續站上起點之前仍有「線下」的資料
    tier = 0 if bias < 0 else 1 if bias < TH["tiers"][1] else 2 if bias < TH["tiers"][2] else 3 if bias < TH["tiers"][3] else 4
    fresh = st == 1 and crossed
    # 跌深
    w = cl[-TH["dropWin"]:]; iH = max(range(len(w)), key=lambda i: w[i]); hiC = w[iH]; loC = min(w[iH:])
    drop = (loC / hiC - 1) * 100
    rebound = drop <= -TH["drop"] and st >= 1 and crossed and st <= TH["recross"]
    # 外資／法人
    f_st = t_st = d_st = 0
    if inst:
        f_st, t_st, d_st = (consec([x[k] if x else None for x in inst]) for k in range(3))
    foreign = f_st >= TH["fgn"] and fresh
    # 量能
    avg = sum(vol[-20:]) / 20 if n >= 20 else None; vr = vol[-1] / avg if avg else None
    rng = hi[-1] - lo[-1]; up = hi[-1] - max(o[-1], close); shadow = up / rng if rng > 0 else 0
    volume = bool(vr and vr >= TH["vol"] and close > o[-1] and close > cl[-2] and shadow <= TH["shadow"])
    stable = st >= TH["stable"] and m60[-1] is not None and m5[-1] > m20[-1] > m60[-1]
    instbuy = max(f_st, t_st, d_st) >= TH["inst"]
    scen = [k for k, v in (("rebound", rebound), ("foreign", foreign), ("volume", volume), ("stable", stable), ("fresh", fresh), ("inst", instbuy)) if v]
    # 風險
    r10 = (close / cl[-11] - 1) * 100 if n > 11 else 0
    jump = r10 >= TH["jump10"] or bias >= TH["jumpBias"]
    ups = sum(1 for i in range(n - TH["gapWin"], n) if lo[i] > hi[i - 1]); dns = sum(1 for i in range(n - TH["gapWin"], n) if hi[i] < lo[i - 1])
    gap = ups >= TH["gap"] or dns >= TH["gap"]
    # 量價背離
    div, divtxt = False, "近 3 日收盤未創近 20 日新高"
    if n >= 25:
        k = next((i for i in range(n - 1, n - 1 - TH["divWin"], -1) if cl[i] >= max(cl[i - 20:i])), None)
        if k is not None:
            base = max(0, k - 60)
            sw = [i for i in range(base + 2, k - 2) if cl[i] == max(cl[i - 2:i + 3])]
            prev = sw[-1] if sw else None
            if prev is None: divtxt = f"{rows[k][0][5:]} 收盤創 20 日新高，前 60 日內找不到可比對的波段高點"
            else:
                div = vol[k] < TH["divVol"] * vol[prev]
                divtxt = f"{rows[k][0][5:]} 收盤 {cl[k]:g} 創 20 日新高，量 {vol[k]/1000:,.0f} 張；前高 {rows[prev][0][5:]} 收盤 {cl[prev]:g} 量 {vol[prev]/1000:,.0f} 張（比 {vol[k]/vol[prev]*100 if vol[prev] else 0:.0f}%）"
    mg = False; mgtxt = "官方資料未提供（非融資標的或當日未列入）"; mgv = None
    if marg and marg[-1] and marg[0] and marg[0][0]:
        bal, b0 = marg[-1][0], marg[0][0]; d5 = bal - b0; pct = d5 / b0 * 100
        mg = pct >= TH["marginPct"] and d5 >= TH["marginMin"]; mgv = [bal, round(d5), round(pct, 1)]
        mgtxt = f"融資餘額 {bal:,.0f} 張，5 日 {d5:+,.0f} 張（{pct:+.1f}%）"
    risk = [
        dict(id="jump", warn=jump, text=f"近 10 日漲幅 {r10:+.1f}%，乖離生命線 {bias:+.1f}%"),
        dict(id="gap", warn=gap, text=f"近 {TH['gapWin']} 日向上跳空 {ups} 次、向下跳空 {dns} 次"),
        dict(id="div", warn=div, text=divtxt),
        dict(id="margin", warn=mg, text=mgtxt),
    ]
    return dict(code=h["code"], close=close, life=round(life, 2), bias=round(bias, 1), streak=st, crossed=crossed, tier=tier,
                drop=round(drop, 1), r10=round(r10, 1), vr=round(vr, 2) if vr else None, shadow=round(shadow * 100),
                fs=f_st, ts=t_st, ds=d_st, scen=scen, risk=risk, margin=mgv, date=h["date"])

def main():
    chips = json.loads((D / "chips.json").read_text()); days = chips["days"]; got = chips["instGot"]
    stocks = {s["code"]: s for s in json.loads((D / "stocks.json").read_text())["stocks"]}
    items = {}; latest = max((s["date"] for s in stocks.values()), default=None)
    for f in sorted((D / "history").glob("*.json")):
        h = json.loads(f.read_text())
        s = stocks.get(h["code"])
        if not s or h["date"] != s["date"]: continue
        raw = chips["inst"].get(h["code"])
        inst = None
        if raw: inst = [x if (x and days[i] in got.get(s["market"], [])) else None for i, x in enumerate(raw)]
        marg = chips["margin"].get(h["code"])
        a = analyze(h, inst, marg)
        if a: a["name"] = s["name"]; a["market"] = s["market"]; a["etf"] = bool(s.get("etf")); items[h["code"]] = a
    cnt = {k["id"]: sum(1 for a in items.values() if k["id"] in a["scen"]) for k in SCEN}
    tcnt = [sum(1 for a in items.values() if a["tier"] == i) for i in range(5)]
    out = dict(meta=dict(date=latest, n=len(items), counts=cnt, tierCounts=tcnt, lifeline=f"MA{LIFE}（月線）",
                         src="本站依證交所／櫃買中心官方收盤價量、三大法人（T86）、融資餘額自行計算；非買賣建議"),
               defs=dict(scen=SCEN, tiers=TIERS, tierRule=TIER_RULE, risk=RISK, th=TH,
                         life=f"生命線＝站內自訂的 MA{LIFE}（20 日收盤均線，俗稱月線）；非任何第三方網站的「生命線」定義。"), items=items)
    (D / "screen.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print("screen", len(items), cnt, tcnt)

if __name__ == "__main__": main()
