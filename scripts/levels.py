"""支撐壓力 v2（結構法＋共振強度）：只用真實歷史成交結構，不使用樞紐點等推算價；全部為自行計算的觀察價位，非買賣建議。
1. 候選（每個候選帶「依據」標籤）：前波高點／前高轉支撐（前後各 K 日確認）、近期高點與近 3 日爆量K高點（尚未確認，標「暫定」）、
   前波低點（只當支撐）、爆量K高／低點、成交量密集區（近 60 日價量分布的局部高峰）、缺口上／下緣、MA5/20/60/120 反壓或支撐、
   整理平台（上／下緣，量縮另標）、均線多頭結構（該結構形成時 MA5>MA20>MA60）、近期低點。波段低點不再當壓力。
2. 價格帶寬度依波動調整：寬度上限 W＝clamp(WK × 14 日平均真實波幅%, 0.8%, 3.5%)，支撐 WK＝0.25、壓力 WK＝0.55；自現價往外，距該帶起點 W 內的候選合併。
3. 共振強度＝同一價格帶內「不同依據種類」的數量：1 招弱、2 招中、3 招強、4 招以上極強。
4. 壓力：弱／中（≤2 招）且距現價 <1% 者降為「小字」不當第一壓力；第一壓力＝其後第一個帶；第二壓力需與第一壓力帶上緣拉開 GAP（依波動，至少 MING）才算獨立，
   中間的帶列為「其他結構價位」；現價上方 +10% 以外最多列 3 個「中長期壓力」。支撐：近端（0~-10%）、中期（-10~-20%）、長期結構（-20% 以外）。
5. 價位 price 為靠近現價的那一端（支撐＝帶上緣、壓力＝帶下緣），另附整段價格帶 low–high；依台股升降單位取整。
6. 每帶附歷史觸及／守住（支撐）或受阻／突破（壓力）次數；另附布局參考區（近 60 日成交量集中區，自行計算）。
7. 找不到結構時回傳空（前端顯示「尚未形成」）。漲跌停價僅作參考，不列為結構價位。"""
import math
VERSION = "v2"
P = dict(K=2, VOLX=1.5, WKS=0.25, WKR=0.55, SKIPK=2, WMIN=0.008, WMAX=0.035, GAPK=0.65, MING=0.02, WIN=250, VPW=60, VPBIN=0.35, MIDN=3, MAXPRE=5, BOX=1, VP=1, GAPS=1, MAS=(5, 20, 60, 120), SWL=1, ALIGN=1)

def tick(p):
    return 0.01 if p < 10 else 0.05 if p < 50 else 0.1 if p < 100 else 0.5 if p < 500 else 1 if p < 1000 else 5

def rtick(p):
    t = tick(p); return round(round(p / t) * t, 2)

def limits(prev_close):
    up, dn = prev_close * 1.1, prev_close * 0.9
    return dict(up=round(math.floor(up / tick(up) + 1e-9) * tick(up), 2), down=round(math.ceil(dn / tick(dn) - 1e-9) * tick(dn), 2))

STR = {1: "弱", 2: "中", 3: "強"}
def strength(k): return "極強" if k >= 4 else STR.get(k, "弱")

def _atrp(h, n=14):
    s = h[-n - 1:]
    if len(s) < 3: return 0.03
    tr = [max(b[2] - b[3], abs(b[2] - a[4]), abs(b[3] - a[4])) for a, b in zip(s, s[1:])]
    return sum(tr) / len(tr) / h[-1][4]

def _sma(cl, i, m): return sum(cl[i - m + 1:i + 1]) / m if i >= m - 1 else None

def candidates(h, close, p=P):
    """回傳 [(價, 依據, 日期, 方向, 暫定)]；方向 H＝高點類（可當壓力或轉支撐）、L＝低點類（只當支撐）、M＝兩邊皆可（均線／密集區／缺口等）。"""
    n = len(h); k = p["K"]; c = []
    cl = [x[4] for x in h]; vol = [(x[5] or 0) for x in h]
    def aligned(i):
        a, b, d = _sma(cl, i, 5), _sma(cl, i, 20), _sma(cl, i, 60)
        return bool(a and b and d and a > b > d)
    for i in range(n):
        d, hi, lo = h[i][0], h[i][2], h[i][3]
        confirmed = i >= k and i + k < n
        if confirmed:
            if all(hi >= h[j][2] for j in range(i - k, i + k + 1)):
                c.append((hi, "前波高點", d, "H", False))
                if p["ALIGN"] and aligned(i): c.append((hi, "均線多頭結構", d, "H", False))
            if all(lo <= h[j][3] for j in range(i - k, i + k + 1)): c.append((lo, "前波低點", d, "L", False))
        if i >= 20:
            avg = sum(vol[i - 20:i]) / 20
            if avg and vol[i] >= p["VOLX"] * avg:
                prov = i >= n - 3
                c.append((hi, "爆量K高點", d, "H", prov)); c.append((lo, "爆量K低點", d, "L", prov))
    # 暫定（尚未確認）：近 5 日高點／低點
    w = h[-p["MAXPRE"]:]
    mh = max(w, key=lambda x: x[2]); ml = min(w, key=lambda x: x[3])
    c.append((mh[2], "近期高點", mh[0], "H", True)); c.append((ml[3], "近期低點", ml[0], "L", True))
    # 均線
    for m in p["MAS"]:
        v = _sma(cl, n - 1, m)
        if v: c.append((v, f"MA{m}", h[-1][0], "M", False))
    # 缺口（尚未回補）
    for i in (range(max(1, n - 60), n) if p["GAPS"] else ()):
        a, b = h[i - 1], h[i]
        if b[3] > a[2] and min(x[3] for x in h[i:]) > a[2]: c.append((a[2], "缺口下緣", b[0], "M", False)); c.append((b[3], "缺口上緣", b[0], "M", False))
        if b[2] < a[3] and max(x[2] for x in h[i:]) < a[3]: c.append((b[2], "缺口下緣", b[0], "M", False)); c.append((a[3], "缺口上緣", b[0], "M", False))
    # 整理平台（前 20 日區間窄）
    if p["BOX"] and n >= 22:
        bw = h[-21:-1]; bh = max(x[2] for x in bw); bl = min(x[3] for x in bw)
        if (bh / bl - 1) <= 0.12:
            shrink = sum(vol[-10:]) < sum(vol[-30:-10]) / 2 * 0.9 if n >= 30 else False
            lab = "整理平台與量縮" if shrink else "整理平台"
            c.append((bh, lab, h[-2][0], "M", False)); c.append((bl, lab, h[-2][0], "L", False))
    # 成交量密集區
    vp = volprofile(h, p) if p["VP"] else None
    if vp:
        for px in vp["peaks"]: c.append((px, "成交量密集區", h[-1][0], "M", False))
    return c

def volprofile(h, p=P):
    w = h[-p["VPW"]:]
    if len(w) < 20: return None
    lo = min(x[3] for x in w); hi = max(x[2] for x in w); atr = _atrp(h) * h[-1][4]
    bw = max(tick(h[-1][4]), atr * p["VPBIN"])
    nb = max(1, int((hi - lo) / bw) + 1); bins = [0.0] * nb
    for x in w:
        a = int((x[3] - lo) / bw); b = int((x[2] - lo) / bw); v = (x[5] or 0) / (b - a + 1)
        for j in range(a, b + 1): bins[j] += v
    tot = sum(bins)
    if not tot: return None
    mean = tot / nb
    peaks = [lo + (j + 0.5) * bw for j in range(nb) if bins[j] >= 1.5 * mean and bins[j] >= (bins[j - 1] if j else 0) and bins[j] >= (bins[j + 1] if j + 1 < nb else 0)]
    # 中央 50% 成交量區間（布局參考區）
    cum = 0; q1 = q3 = None
    for j in range(nb):
        cum += bins[j]
        if q1 is None and cum >= tot * 0.25: q1 = lo + j * bw
        if q3 is None and cum >= tot * 0.75: q3 = lo + (j + 1) * bw; break
    return dict(peaks=peaks, q1=q1, q3=q3, days=len(w))

def _cluster(cs, W):
    """cs 已依離現價由近到遠排序；回傳價格帶清單（每帶為候選 list）。"""
    out = []
    for c in cs:
        if out and abs(c[0] - out[-1][0][0]) <= out[-1][0][0] * W: out[-1].append(c)
        else: out.append([c])
    return out

def _band(g, side, h, close):
    prices = [x[0] for x in g]
    lo, hi = min(prices), max(prices)
    near = hi if side == "S" else lo
    basis = []
    for x in g:
        lab = x[1]
        if side == "S" and lab == "前波高點": lab = "前高轉支撐"
        if lab.startswith("MA"): lab = lab + ("反壓" if side == "R" else "支撐")
        if lab == "爆量K高點" and side == "S": lab = "爆量K高點轉支撐"
        if lab == "近期高點" and side == "S": lab = "近期高點轉支撐"
        if lab not in basis: basis.append(lab)
    kinds = len(basis)
    allprov = all(x[4] for x in g)
    b = dict(price=rtick(near), low=rtick(lo), high=rtick(hi), n=kinds, nraw=len(g), basis=basis, strength=strength(kinds),
             last=max(x[2] for x in g), dist=round((rtick(near) / close - 1) * 100, 1))
    if allprov: b["prov"] = True
    elif any(x[4] for x in g): b["provPart"] = True
    return b

def touches(b, side, h):
    """歷史觸及與守住（支撐）／受阻與突破（壓力）次數：連續觸及視為一次（間隔 ≥3 根才算新一次），最近一根不計入（尚無後續）。"""
    n = len(h); lo, hi = b["low"], b["high"]; eps = []; i = 0
    while i < n - 1:
        r = h[i]
        if r[3] <= hi * 1.002 and r[2] >= lo * 0.998 and not (side == "S" and r[3] > hi) and not (side == "R" and r[2] < lo):
            j = i
            while j + 1 < n - 1 and h[j + 1][3] <= hi * 1.002 and h[j + 1][2] >= lo * 0.998: j += 1
            eps.append((i, j)); i = j + 3
        else: i += 1
    t = held = 0
    for a, z in eps:
        seg = h[a:min(n, z + 3)]
        if side == "S":
            t += 1
            if all(x[4] >= lo * 0.995 for x in seg): held += 1
        else:
            t += 1
            if all(x[4] <= hi * 1.005 for x in seg): held += 1
    return dict(t=t, h=held)

def compute(rows, close=None, params=None, detail=False):
    """保護殼：任何例外都不讓每日更新失敗，改回傳「計算失敗」讓前端顯示尚未形成。"""
    try: return _compute(rows, close, params, detail)
    except Exception as e: return dict(status="計算失敗", support=[], resistance=[], limits=None, error=f"{type(e).__name__}: {e}")

def _compute(rows, close=None, params=None, detail=False):
    p = dict(P, **(params or {}))
    if len(rows) < 20: return dict(status="資料不足", support=[], resistance=[], limits=None)
    h = rows[-p["WIN"]:]; close = h[-1][4] if close is None else close
    atrp = _atrp(h); WS = min(p["WMAX"], max(p["WMIN"], p["WKS"] * atrp)); WR = min(p["WMAX"], max(p["WMIN"], p["WKR"] * atrp)); W = WR
    gap = max(p["MING"], p["GAPK"] * atrp)
    cands = candidates(h, close, p)
    sup = sorted([c for c in cands if c[0] < close and c[3] in ("H", "L", "M")], key=lambda c: -c[0])
    res = sorted([c for c in cands if c[0] > close and c[3] in ("H", "M")], key=lambda c: c[0])
    S = [_band(g, "S", h, close) for g in _cluster(sup, WS)]
    R = [_band(g, "R", h, close) for g in _cluster(res, WR)]
    for b in S: b["tier"] = "近端" if b["dist"] >= -10 else "中期" if b["dist"] >= -20 else "長期結構"
    near_s = [b for b in S if b["dist"] >= -20]
    long_s = next((b for b in S if b["dist"] < -20), None)
    # 壓力：弱且 <1% 降為小字
    minor = [b for b in R if b["n"] <= p["SKIPK"] and b["dist"] < 1.0]
    R2 = [b for b in R if b not in minor]
    mid = [b for b in R2 if b["dist"] > 10]
    near_r = [b for b in R2 if b["dist"] <= 10]
    r1 = near_r[0] if near_r else None
    r2 = None; other = []
    if r1:
        r1["tier"] = "第一壓力"
        for b in near_r[1:]:
            if r2 is None and b["low"] >= r1["high"] * (1 + gap): r2 = b; b["tier"] = "第二壓力"
            else: other.append(b); b["tier"] = "其他結構價位"
    if r1 is None and mid:   # 近端無壓力，最近的中長期帶升為第一壓力以外的中長期
        pass
    for b in mid[:p["MIDN"]]: b["tier"] = "中長期壓力"
    for b in minor: b["tier"] = "弱壓力（小字）"
    for b in near_s[:2]: pass
    for i, b in enumerate(near_s[:2]):
        b["tier"] = ("近端" if b["dist"] >= -10 else "中期") if i == 0 else "第二支撐"
        if i == 1 and b["dist"] < -10: b["tier"] = "第二支撐"
    for b in near_s[:2]: b["touch"] = touches(b, "S", h)
    for b in ([r1, r2] + other + mid[:p["MIDN"]]):
        if b: b["touch"] = touches(b, "R", h)
    if long_s: long_s["tier"] = "長期結構"; long_s["touch"] = touches(long_s, "S", h)
    vpf = volprofile(h, p)
    zone = None
    if vpf and vpf["q1"] and vpf["q3"]:
        z1, z3 = rtick(vpf["q1"]), rtick(vpf["q3"])
        zone = dict(low=z1, high=z3, days=vpf["days"], pos="區內" if z1 <= close <= z3 else "區上方" if close > z3 else "區下方",
                    note=f"近 {vpf['days']} 個交易日中，一半成交量集中的價格區間（自行以日線高低區間均攤成交量計算，非其他網站算法）")
    out = dict(support=near_s[:2], resistance=[x for x in (r1, r2) if x], longSupport=long_s, otherRes=other, midRes=mid[:p["MIDN"]], minorRes=minor[:3],
               zone=zone, limits=limits(rows[-1][4]), atrPct=round(atrp * 100, 2), bandW=[round(WS * 100, 2), round(WR * 100, 2)], gapPct=round(gap * 100, 2), version=VERSION,
               method="結構法 v2：前波高低點＋爆量K＋成交量密集區＋缺口＋均線＋整理平台，價格帶寬度依波動調整，同帶內不同依據越多共振越強")
    if detail: out["_cands"] = cands; out["_S"] = S; out["_R"] = R
    return out
