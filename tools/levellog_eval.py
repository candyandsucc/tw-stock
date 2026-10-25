"""以 snapshots/levellog.json（每日留存的第一支撐／第一壓力帶）對照隔個交易日的實際高低收，統計守住率。
用法：python3 tools/levellog_eval.py   （需累積 ≥2 個交易日；觸及＝隔日最低價進入支撐帶／最高價進入壓力帶；守住＝隔日收盤仍在帶的外側）
"""
import json, pathlib
R = pathlib.Path(__file__).resolve().parent.parent
log = json.loads((R / "snapshots/levellog.json").read_text())
days = sorted(log)
if len(days) < 2: raise SystemExit(f"只有 {len(days)} 天留存，至少需要 2 天")
st = {"S": [0, 0], "R": [0, 0]}
for d1, d2 in zip(days, days[1:]):
    for c, v in log[d1].items():
        f = R / "site/data/history" / f"{c}.json"
        if not f.exists(): continue
        rows = {r[0]: r for r in json.loads(f.read_text())["rows"]}
        n = rows.get(d2)
        if not n: continue
        close, sl, sh, rl, rh = v[:5]
        if sl is not None and n[3] <= sh: st["S"][0] += 1; st["S"][1] += n[4] >= sl
        if rl is not None and n[2] >= rl: st["R"][0] += 1; st["R"][1] += n[4] <= rh
for k, (t, h) in st.items(): print({"S": "支撐帶", "R": "壓力帶"}[k], f"觸及 {t} 次，守住 {h} 次（{h / t * 100:.1f}%）" if t else "無觸及", f"｜期間 {days[0]}–{days[-1]}")
