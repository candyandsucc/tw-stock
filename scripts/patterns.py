"""簡單形態偵測（觀察用，不是買賣訊號、不預測突破方向）。rows: [[date,o,h,l,c,v],...]（已還原）
1. 上升趨勢線：近 60 日內取波段低點（前後各 2 日確認），最近 3 個低點依序墊高（higher lows）且首尾相距 ≥ 15 個交易日，
   以最小平方法擬合趨勢線；收盤在線上（容許 -1.5%）→「守住」，低於 → 「跌破」。
2. 整理平台：取「不含今日」的前 N 日（N=20、15、10 由長到短）最高/最低價，區間寬度 ≤ 門檻（N=20：12%；N≤15：9%）即成立；
   再依今日收盤標示「平台內／收盤突破平台上緣／收盤跌破平台下緣」。"""

def _swing_lows(h, k=2):
    n = len(h)
    return [i for i in range(k, n - k) if all(h[i][3] <= h[j][3] for j in range(i - k, i + k + 1))]

def trendline(h, close):
    h = h[-60:]; n = len(h)
    lows = _swing_lows(h)
    if len(lows) < 3: return None
    pts = lows[-3:]
    if not (h[pts[0]][3] < h[pts[1]][3] < h[pts[2]][3]) or pts[2] - pts[0] < 15: return None
    xs, ys = pts, [h[i][3] for i in pts]
    mx, my = sum(xs) / 3, sum(ys) / 3
    den = sum((x - mx) ** 2 for x in xs)
    sl = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den; ic = my - sl * mx
    today = ic + sl * (n - 1)
    if today <= 0: return None
    dist = (close / today - 1) * 100
    return dict(state="守住" if dist >= -1.5 else "跌破", points=[[h[i][0], h[i][3]] for i in pts], slopePct=round(sl / today * 100, 2),
                lineToday=round(today, 2), dist=round(dist, 1), sinceDays=n - 1 - pts[0])

def box(h, close):
    for N, thr in ((20, 12), (15, 9), (10, 9)):
        if len(h) < N + 1: continue
        w = h[-N - 1:-1]; hi = max(x[2] for x in w); lo = min(x[3] for x in w)
        width = (hi / lo - 1) * 100
        if width <= thr:
            return dict(days=N, high=hi, low=lo, width=round(width, 1),
                        state="收盤突破平台上緣" if close > hi else "收盤跌破平台下緣" if close < lo else "平台內整理")
    return None

def detect(rows, close):
    if len(rows) < 25: return dict(trend=None, box=None, status="資料不足")
    return dict(trend=trendline(rows, close), box=box(rows, close),
                note="形態為依歷史價量自動偵測的觀察用標示，不是買賣訊號，也不預測突破方向")
