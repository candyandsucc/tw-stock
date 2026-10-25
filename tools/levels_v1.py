"""支撐壓力（結構法）：只用真實歷史成交結構，不使用樞紐點等推算價。
1. 結構候選：近 120 日內 ① 波段高點/低點（前後各 K 日確認）② 量能K（成交量 ≥ 前 20 日均量 VOLX 倍）的最高/最低價。
2. 支撐候選另含 MA5/MA20、近 20 日高低點、未回補缺口邊緣；壓力只用已確認的價格結構（波段/量能K），被之後最高價突破超過 BRK 的高點不再當壓力。
3. 合併：自現價往外，與該帶起點相距 MERGE 內的相鄰結構合併為同一價格帶（同一波動容差內）。
4. 依台股升降單位取整。支撐：現價下方 0–10% 為近端，10–20% 為遠端；壓力：第一壓力帶之上下一個獨立結構，超過 +10% 改標中期壓力。
5. 找不到真實結構時回傳 None（前端顯示「尚未形成」）。漲跌停價僅作參考，不列為結構價位。"""
import math
K, VOLX, BRK, MERGE = 2, 1.5, 0.01, 0.016

def tick(p):
    return 0.01 if p < 10 else 0.05 if p < 50 else 0.1 if p < 100 else 0.5 if p < 500 else 1 if p < 1000 else 5

def rtick(p, mode="near"):
    t = tick(p); return round(round(p / t) * t, 2)

def limits(prev_close):
    up, dn = prev_close * 1.1, prev_close * 0.9
    return dict(up=round(math.floor(up / tick(up) + 1e-9) * tick(up), 2), down=round(math.ceil(dn / tick(dn) - 1e-9) * tick(dn), 2))

def compute(rows, close, k=K, volx=VOLX, brk=BRK, merge=MERGE):
    h = rows[-120:]; n = len(h); cands = []
    for i in range(n):
        d, hi, lo = h[i][0], h[i][2], h[i][3]
        if i >= k and i + k < n:
            if all(hi >= h[j][2] for j in range(i - k, i + k + 1)): cands.append((hi, "波段高點", d, i, "H"))
            if all(lo <= h[j][3] for j in range(i - k, i + k + 1)): cands.append((lo, "波段低點", d, i, "L"))
        if i >= 20:
            avg = sum((x[5] or 0) for x in h[i - 20:i]) / 20
            if avg and (h[i][5] or 0) >= volx * avg:
                cands.append((hi, "量能K高", d, i, "H")); cands.append((lo, "量能K低", d, i, "L"))
    # 均線、近 20 日高低點、未回補缺口邊緣
    cl = [x[4] for x in h]
    for m in (5, 20):
        if n >= m: cands.append((sum(cl[-m:]) / m, f"MA{m}", h[-1][0], n - 1, "M"))
    if n >= 20:
        w = h[-20:]
        lo = min(w, key=lambda x: x[3]); hi = max(w, key=lambda x: x[2])
        cands.append((lo[3], "近 20 日低點", lo[0], n - 1, "M")); cands.append((hi[2], "近 20 日高點", hi[0], n - 1, "M"))
    for i in range(max(1, n - 60), n):
        a, b = h[i - 1], h[i]
        if b[3] > a[2] and min(x[3] for x in h[i:]) > a[2]: cands.append((a[2], "缺口下緣", b[0], n - 1, "M")); cands.append((b[3], "缺口上緣", b[0], n - 1, "M"))
        if b[2] < a[3] and max(x[2] for x in h[i:]) < a[3]: cands.append((b[2], "缺口下緣", b[0], n - 1, "M")); cands.append((a[3], "缺口上緣", b[0], n - 1, "M"))
    def alive(c):
        p, _, _, i, t = c; later = h[i + 1:]
        if not later: return True
        if t == "H" and p > close: return max(x[2] for x in later) <= p * (1 + brk)
        return True
    sup = sorted([c for c in cands if c[0] < close and alive(c)], key=lambda c: -c[0])
    res = sorted([c for c in cands if c[0] > close and c[4] != "M" and alive(c)], key=lambda c: c[0])
    def bands(cs):
        out = []
        for c in cs:
            if out and abs(c[0] - out[-1][0][0]) <= out[-1][0][0] * merge: out[-1].append(c)
            else: out.append([c])
        return [dict(price=rtick(g[0][0]), low=rtick(min(x[0] for x in g)), high=rtick(max(x[0] for x in g)), n=len(g),
                     basis=sorted({x[1] for x in g}), last=max(x[2] for x in g)) for g in out]
    S, R = bands(sup), bands(res)
    for b in S: b["dist"] = round((b["price"] / close - 1) * 100, 1); b["tier"] = "近端" if b["dist"] >= -10 else "中期" if b["dist"] >= -20 else "長期結構"
    for b in R: b["dist"] = round((b["price"] / close - 1) * 100, 1)
    r1 = R[0] if R else None
    r2 = R[1] if len(R) > 1 else None
    if r1: r1["tier"] = "第一壓力"
    if r2: r2["tier"] = "中期壓力" if r2["dist"] > 10 else "第二壓力"
    if len(rows) < 20: return dict(status="資料不足", support=[], resistance=[], limits=None)
    return dict(support=S[:2], resistance=[x for x in (r1, r2) if x], limits=limits(rows[-1][4]),
                method="結構法：波段高低點＋量能K，跌破/突破失效，1.6% 內合併為價格帶，依升降單位取整")
