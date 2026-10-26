#!/usr/bin/env python3
"""基本面：本益比／殖利率／股價淨值比（證交所 OpenAPI BWIBBU_ALL、櫃買中心 OpenAPI tpex_mainboard_peratio_analysis）
＋ 近 12 個月月營收（公開資訊觀測站「每月營業收入彙總表」靜態頁 t21sc03，上市 sii／上櫃 otc；證交所 OpenAPI t187ap05_L 為備援僅供最新月核對）。
輸出 site/data/fund.json、site/data/rev.json；逐月快取於 snapshots/rev/。任何來源抓不到就留空，不以其他來源補值。"""
import json, re, time, pathlib, datetime as dt, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent; D = ROOT / "site" / "data"; REV = ROOT / "snapshots" / "rev"
REV.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 tw-stock-lab"}; SLEEP = 2.0

def raw(url, tries=3, enc="utf-8-sig"):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: return r.read().decode(enc, errors="replace")
        except Exception as e:
            print("retry", url, e); time.sleep(3 * (i + 1))
    return None

def num(s):
    try: return float(str(s).replace(",", "").strip())
    except ValueError: return None

def roc(s):
    s = str(s); return f"{int(s[:-4])+1911}-{s[-4:-2]}-{s[-2:]}" if len(s) >= 7 else None

def valuation():
    items, dates = {}, {}
    t = raw("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL")
    for r in json.loads(t) if t else []:
        items[r["Code"].strip()] = [num(r["PEratio"]), num(r["DividendYield"]), num(r["PBratio"])]; dates["上市"] = roc(r["Date"])
    t = raw("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis")
    for r in json.loads(t) if t else []:
        items[r["SecuritiesCompanyCode"].strip()] = [num(r["PriceEarningRatio"]), num(r["YieldRatio"]), num(r["PriceBookRatio"])]; dates["上櫃"] = roc(r["Date"])
    return dict(dates=dates, items=items,
                src=dict(twse="https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL", tpex="https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis"))

ROW = re.compile(r"<td align=center>(\d{4,6})</td><td align=left>[^<]*</td>((?:<[tT]d nowrap>[^<]*</[tT]d>){3,8})", re.S)
def parse_rev(html):
    out = {}
    for m in ROW.finditer(html):
        cells = [num(x) for x in re.findall(r"<[tT]d nowrap>([^<]*)</[tT]d>", m.group(2))]
        if len(cells) >= 5 and cells[0] is not None: out[m.group(1)] = [cells[0], cells[4], cells[3]]   # 當月營收(千元)、去年同月增減%、上月比較增減%
    return out

def months(today, n=12):
    y, m = today.year, today.month; out = []
    for _ in range(n):
        m -= 1
        if m == 0: y, m = y - 1, 12
        out.append((y, m))
    return out[::-1]

def revenue(today=None):
    today = today or dt.date.today(); ms = months(today); refresh = set(ms[-2:])
    res = {}; got = []
    for y, m in ms:
        # _0＝國內公司頁；_1＝外國企業（KY、DR）頁，同一張官方彙總表的另一頁，之前漏抓導致 KY／DR 股沒有月營收
        for mk, d, k, need in (("上市", "sii", 0, 300), ("上櫃", "otc", 0, 300), ("上市", "sii", 1, 20), ("上櫃", "otc", 1, 10)):
            f = REV / (f"{d}_{y}{m:02d}.json" if k == 0 else f"{d}f_{y}{m:02d}.json")
            if f.exists() and (y, m) not in refresh: v = json.loads(f.read_text())
            else:
                t = raw(f"https://mopsov.twse.com.tw/nas/t21/{d}/t21sc03_{y-1911}_{m}_{k}.html", enc="big5hkscs"); time.sleep(SLEEP)
                v = parse_rev(t) if t else {}
                if len(v) >= need: f.write_text(json.dumps(v, ensure_ascii=False, separators=(",", ":")))
                elif f.exists(): v = json.loads(f.read_text())   # 新資料不完整（尚未公布）時沿用快取
                else: v = {}
            if v:
                got.append(f"{y}{m:02d}_{d}")
                for c, x in v.items(): res.setdefault(c, {})[f"{y}-{m:02d}"] = x
    return res, got

def main():
    val = valuation(); (D / "fund.json").write_text(json.dumps(val, ensure_ascii=False, separators=(",", ":")))
    print("valuation", len(val["items"]), val["dates"])
    stocks = {s["code"] for s in json.loads((D / "stocks.json").read_text())["stocks"]}
    res, got = revenue()
    items = {c: [[ym] + v[ym] for ym in sorted(v)] for c, v in res.items() if c in stocks}
    last = max((r[-1][0] for r in items.values()), default=None)
    (D / "rev.json").write_text(json.dumps(dict(latest=last, items=items, months=sorted({g[:6] for g in got}),
        src="公開資訊觀測站 每月營業收入彙總表（mopsov.twse.com.tw/nas/t21/{sii|otc}/t21sc03_民國年_月_{0 國內公司|1 外國企業 KY/DR}.html）", unit="千元"), ensure_ascii=False, separators=(",", ":")))
    print("revenue", len(items), last)

if __name__ == "__main__": main()
