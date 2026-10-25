"""除權還原：以證交所 TWT49U、櫃買中心 exDailyQ（除權息計算結果表）的「除權息前收盤價／除權息參考價」取還原因子。
只還原「參考價 / 前收 ≤ 0.90」的重大除權（股票分割、大額配股、減資後復牌等），一般現金股息（通常 < 5%）不調整。
還原：除權日（不含）以前的 開高低收 × 因子、成交量 ÷ 因子，使均線與支撐壓力在除權前後可連續比較。"""
import json, re, time, datetime as dt, urllib.request, calendar
UA = {"User-Agent": "Mozilla/5.0 tw-stock-lab"}
THRESH = 0.90

def _get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.loads(r.read().decode("utf-8-sig"))
        except Exception as e:
            print("adjust retry", url, e); time.sleep(2 * (i + 1))
    return None

def _n(s):
    try: return float(str(s).replace(",", ""))
    except ValueError: return None

import pathlib
_CACHE = pathlib.Path(__file__).resolve().parent.parent / "snapshots" / "exr_cache.json"   # 已結束月份的重大除權事件（官方資料不會再變，快取避免每日重抓 16 個月）

def _cload():
    try: return json.loads(_CACHE.read_text())
    except Exception: return {}

def events(start: dt.date, end: dt.date, sleep=1.0):
    """回傳 {code: [(YYYY-MM-DD, factor, 市場, 前收, 參考價)]}（僅重大除權）。已結束月份且兩個來源都成功取得者快取於 snapshots/exr_cache.json；取不到的月份不快取、下次重試。"""
    out = {}; y, m = start.year, start.month; cache = _cload(); dirty = False
    while (y, m) <= (end.year, end.month):
        key = f"{y}-{m:02d}"
        if key in cache and (y, m) < (end.year, end.month):
            for c, d, f, mk, p0, p1 in cache[key]: out.setdefault(c, []).append((d, f, mk, p0, p1))
            m += 1
            if m == 13: y, m = y + 1, 1
            continue
        mine = []; ok = True
        a = f"{y}{m:02d}01"; b = f"{y}{m:02d}{calendar.monthrange(y, m)[1]:02d}"
        j = _get(f"https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate={a}&endDate={b}&response=json"); time.sleep(sleep)
        if not j or j.get("stat") not in ("OK", "很抱歉，沒有符合條件的資料!"): ok = False
        for r in (j or {}).get("data", []) if j and j.get("stat") == "OK" else []:
            mt = re.match(r"(\d+)年(\d+)月(\d+)日", r[0]); p0, p1 = _n(r[3]), _n(r[4])
            if not mt or not p0 or not p1: continue
            d = f"{int(mt[1])+1911}-{int(mt[2]):02d}-{int(mt[3]):02d}"
            if p1 / p0 <= THRESH: out.setdefault(r[1].strip(), []).append((d, round(p1 / p0, 6), "上市", p0, p1)); mine.append([r[1].strip(), d, round(p1 / p0, 6), "上市", p0, p1])
        j = _get(f"https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate={y}/{m:02d}/01&endDate={y}/{m:02d}/{calendar.monthrange(y, m)[1]:02d}&response=json"); time.sleep(sleep)
        if not j or not j.get("tables"): ok = False
        for r in (j or {}).get("tables", [{}])[0].get("data", []) if j and j.get("tables") else []:
            p0, p1 = _n(r[3]), _n(r[4])
            if not p0 or not p1: continue
            s = r[0].replace("/", ""); d = f"{int(s[:-4])+1911}-{s[-4:-2]}-{s[-2:]}"
            if p1 / p0 <= THRESH: out.setdefault(r[1].strip(), []).append((d, round(p1 / p0, 6), "上櫃", p0, p1)); mine.append([r[1].strip(), d, round(p1 / p0, 6), "上櫃", p0, p1])
        if ok and (y, m) < (end.year, end.month): cache[key] = [[c, d, f, mk, p0, p1] for c, d, f, mk, p0, p1 in mine]; dirty = True
        m += 1
        if m == 13: y, m = y + 1, 1
    if dirty:
        try: _CACHE.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")))
        except Exception as e: print("exr cache write fail", e)
    return out

def apply(rows, evs):
    """rows: [[date,o,h,l,c,v],...]；回傳 (還原後 rows, 事件說明 list)。evs 僅取日期落在 rows 範圍內且除權日在資料內者。"""
    dates = [r[0] for r in rows]; info = []
    for d, f, mk, p0, p1 in sorted(evs):
        if d <= dates[0] or d > dates[-1]: continue
        rows = [[r[0]] + ([round(x * f, 4) if x is not None else None for x in r[1:5]] + [round(r[5] / f) if r[5] is not None else None]) if r[0] < d else r for r in rows]
        info.append(dict(date=d, factor=f, prevClose=p0, refPrice=p1, src="證交所 TWT49U" if mk == "上市" else "櫃買中心 exDailyQ"))
    return rows, info
