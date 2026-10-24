#!/usr/bin/env python3
"""由 site/data 產生「自選 25 檔」一頁式總覽 site/data/watch25.json（不連網；fetch.py 結尾呼叫，也可單獨執行）。"""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent; D = ROOT / "site" / "data"

def main():
    wl = json.loads((D / "watchlist.json").read_text(encoding="utf-8"))
    stocks = {s["code"]: s for s in json.loads((D / "stocks.json").read_text(encoding="utf-8"))["stocks"]}
    ch = json.loads((D / "chips.json").read_text(encoding="utf-8")); days = ch["days"]
    items = []
    for c in wl["codes"]:
        s = stocks.get(c); it = dict(code=c, name=(s or {}).get("name") or wl["names"].get(c), ok=False, issues=[])
        if not s: it["issues"].append("當日行情缺"); items.append(it); continue
        prev = s["close"] - (s["change"] or 0)
        it.update(market=s["market"], date=s["date"], close=s["close"], change=s["change"], pct=round((s["change"] or 0) / prev * 100, 2) if prev else None)
        hp = D / "history" / f"{c}.json"
        if hp.exists():
            h = json.loads(hp.read_text(encoding="utf-8")); n = len(h["rows"])
            it.update(days=n, ma5=h["ma5"], ma20=h["ma20"], ma60=h["ma60"], volRatio=h["volRatio"], adjusted=bool(h.get("adjusted")))
            L = h.get("levels") or {}
            for k, key in (("s1", "support"), ("r1", "resistance")):
                b = (L.get(key) or [None])[0]
                it[k] = dict(price=b["price"], low=b["low"], high=b["high"], dist=b["dist"]) if b else None
            p = h.get("patterns") or {}
            it["trend"] = p.get("trend") and dict(state=p["trend"]["state"], dist=p["trend"]["dist"])
            it["box"] = p.get("box") and dict(days=p["box"]["days"], width=p["box"]["width"], state=p["box"]["state"])
            if n < 60: it["issues"].append(f"歷史僅 {n} 日（MA60 不足）")
            if h["ma60"] is None: it["issues"].append("無 MA60")
            if not it["s1"]: it["issues"].append("支撐尚未形成")
            if not it["r1"]: it["issues"].append("壓力尚未形成（可能創新高）")
        else: it["issues"].append("無歷史檔")
        raw = ch["inst"].get(c); got = ch["instGot"].get(s["market"], [])
        if raw and days and days[-1] in got and raw[-1]:
            tot = lambda r: (r[0] + r[1] + r[2]) / 1000 if r else 0
            it["inst"] = dict(date=days[-1], total=round(tot(raw[-1])), foreign=round(raw[-1][0] / 1000), trust=round(raw[-1][1] / 1000), dealer=round(raw[-1][2] / 1000),
                              sum3=round(sum(tot(r) for r in raw[-3:])))
        else: it["inst"] = None
        it["ok"] = bool(it.get("s1") or it.get("r1")) and it.get("ma5") is not None
        items.append(it)
    (D / "watch25.json").write_text(json.dumps(dict(title=wl["title"], date=max((i.get("date") or "" for i in items), default=""), items=items), ensure_ascii=False))
    return items

if __name__ == "__main__":
    for i in main(): print(i["code"], i["name"], i.get("days"), i["ok"], i["issues"])
