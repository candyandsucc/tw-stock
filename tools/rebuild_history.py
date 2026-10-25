#!/usr/bin/env python3
"""一次性／補救用：以全市場每日快照（snapshots，證交所 MI_INDEX／櫃買 dailyQuotes）重建 site/data/history/ 內「現有每一檔」的日線（最近 300 個交易日），
並重算除權還原、MA5/20/60、量比、支撐壓力、形態。日常更新不需要執行（fetch.py／universe.py 每天會自動做）。
用法：python3 tools/rebuild_history.py"""
import json, sys, time, pathlib, datetime as dt
R = pathlib.Path(__file__).resolve().parent.parent; sys.path.insert(0, str(R / "scripts"))
import universe, adjust, patterns
from levels import compute as levels
HIS = R / "site" / "data" / "history"
snaps = universe.load_snaps(universe.DAYS); latest = snaps[-1][0]
ev = adjust.events(dt.date.fromisoformat(snaps[0][0]) - dt.timedelta(days=5), dt.date.fromisoformat(latest))
print("major ex-rights", {c: [(e[0], e[1]) for e in v] for c, v in ev.items()})
n = skip = 0
for f in sorted(HIS.glob("*.json")):
    h = json.loads(f.read_text()); code = h["code"]; rows = universe.rows_of(code, snaps)
    if len(rows) < len(h["rows"]) or not rows or rows[-1][0] != h["date"]: skip += 1; print("skip", code, len(rows), len(h["rows"])); continue
    adj = []
    if code in ev: rows, adj = adjust.apply(rows, ev[code])
    cl = [x[4] for x in rows]; vol = [x[5] or 0 for x in rows]
    sma = lambda k: round(sum(cl[-k:]) / k, 2) if len(cl) >= k else None
    avg = sum(vol[-20:]) / 20 if len(vol) >= 20 else None
    h.update(rows=rows, ma5=sma(5), ma20=sma(20), ma60=sma(60), volRatio=round(vol[-1] / avg, 2) if avg else None,
             levels=levels(rows, cl[-1]) if len(rows) >= 10 else None, adjusted=adj or None, patterns=patterns.detect(rows, cl[-1]))
    h.pop("gaps", None)
    f.write_text(json.dumps(h, ensure_ascii=False)); n += 1
print("rebuilt", n, "skipped", skip)
