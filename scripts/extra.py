#!/usr/bin/env python3
"""延伸官方資料：休市日程、處置／注意／全額交割標記、信用交易（融資融券借券）、外資持股比率。
只用證交所／櫃買中心官方公開資料；每一項獨立 try/except，單項失敗只保留前次資料並印出原因，不影響 daily workflow。
用法：python3 scripts/extra.py [calendar|flags|credit|all]"""
import json, re, sys, time, pathlib, datetime as dt, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data"; CACHE = ROOT / "snapshots" / "chips"; HIS = OUT / "history"
CACHE.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 tw-stock-lab"}; SLEEP = 1.3
TZ = dt.timezone(dt.timedelta(hours=8))

def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.loads(r.read().decode("utf-8-sig"))
        except Exception as e:
            print("retry", url, e); time.sleep(2 * (i + 1))
    return None

def num(s):
    if s is None: return None
    s = str(s).replace(",", "").replace("+", "").replace("%", "").strip()
    try: return float(s)
    except ValueError: return None

def roc8(s):  # 1151022 -> 2026-10-22
    s = str(s).replace("/", "").replace(".", "").strip()
    return f"{int(s[:-4]) + 1911}-{s[-4:-2]}-{s[-2:]}" if len(s) >= 6 else None

def now(): return dt.datetime.now(TZ)

def wjson(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))

# ============ 1. 休市日程 ============
def calendar():
    """證交所 OpenAPI holidaySchedule（休市日程）＋ 近 14 個平日的當日無資料探測（臨時休市，標為「推定」）。輸出 calendar.json。"""
    j = get("https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule")
    old = {}
    try: old = json.loads((OUT / "calendar.json").read_text())
    except Exception: pass
    if not j:
        if old: print("calendar: 取不到，保留前次"); return
        raise RuntimeError("holidaySchedule 取不到")
    closed = {}; open_marks = {}
    for r in j:
        d = roc8(r["Date"]); name = r["Name"].strip()
        if not d: continue
        if "開始交易" in name or "最後交易" in name: open_marks[d] = name; continue   # 這兩種是開市日
        closed[d] = name
    # 臨時休市（颱風等）：平日、不在休市日程，但證交所該日無任何交易資料 → 標示為推定
    temp = dict(old.get("temp") or {}); checked = set(old.get("checked") or [])
    for k in range(1, 15):
        d = now().date() - dt.timedelta(days=k)
        if d.weekday() >= 5 or d.isoformat() in closed or d.isoformat() in temp or d.isoformat() in checked: continue
        mi = get(f"https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={d:%Y%m%d}&type=ALLBUT0999&response=json", tries=2); time.sleep(SLEEP)
        if mi is None: continue
        if not (mi.get("stat") == "OK" and mi.get("date") == f"{d:%Y%m%d}" and any(t.get("data") for t in mi.get("tables", []))):
            temp[d.isoformat()] = "臨時休市（證交所無交易資料，推定）"
        else: checked.add(d.isoformat())
    temp = {d: n for d, n in temp.items() if d >= (now().date() - dt.timedelta(days=400)).isoformat()}
    wjson("calendar.json", dict(updated=now().isoformat(timespec="seconds"), years=sorted({d[:4] for d in closed}),
          closed=dict(sorted(closed.items())), temp=temp, checked=sorted(checked)[-60:], openMarks=open_marks,
          source="https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule", note="臨時休市為平日不在休市日程、且證交所 MI_INDEX 該日無資料時推定"))
    print("calendar ok", len(closed), "closed;", "temp", list(temp))

# ============ 2. 處置／注意／全額交割標記 ============
def _stocks():
    S = json.loads((OUT / "stocks.json").read_text()); return S["meta"], {x["code"]: x for x in S["stocks"]}

def flags():
    """上市：證交所 注意股 notice、處置 punish（rwd 日期區間）、TWT85U 變更交易（全額交割；** 為分盤集合競價）。
    上櫃：櫃買中心 tpex_trading_warning_information、tpex_disposal_information、tpex_cmode（變更交易／分盤／管理股票／停止交易）。輸出 flags.json。"""
    meta, stocks = _stocks(); dd = meta["twseDate"] or meta["tpexDate"]
    d1 = dt.date.fromisoformat(dd); a = (d1 - dt.timedelta(days=10)); items = {}; errs = []
    def it(code): return items.setdefault(code, {})
    def ok(code): return code in stocks
    # --- 上市 注意股（近 10 日公布，之後只留最近 3 個公布日） ---
    nj = get(f"https://www.twse.com.tw/rwd/zh/announcement/notice?response=json&startDate={a:%Y%m%d}&endDate={d1:%Y%m%d}")
    if nj and nj.get("stat") == "OK":
        rows = [(roc8(r[5]), r) for r in nj["data"]]; keep = sorted({d for d, _ in rows if d})[-3:]
        for d, r in rows:
            if d in keep and ok(r[1].strip()):
                e = it(r[1].strip()); n = e.setdefault("n", []); n.append(dict(d=d, c=int(num(r[3]) or 0), t=re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", r[4])).strip()))
    else: errs.append("TWSE notice")
    # --- 上市 處置 ---
    pj = get(f"https://www.twse.com.tw/rwd/zh/announcement/punish?response=json&startDate={(d1 - dt.timedelta(days=40)):%Y%m%d}&endDate={d1:%Y%m%d}")
    if pj and pj.get("stat") == "OK":
        for r in pj["data"]:
            code = r[2].strip()
            if not ok(code): continue
            m = re.findall(r"(\d+)/(\d+)/(\d+)", r[6])
            if len(m) < 2: continue
            st, en = (f"{int(x[0])+1911}-{x[1]}-{x[2]}" for x in m[:2])
            if en < dd: continue
            mm = re.search(r"約每\s*(\S{1,3}?)\s*分鐘", r[8] or ""); cash = "預收款券" in (r[8] or "") or "全部之買進價金" in (r[8] or "")
            if it(code).get("p", {}).get("e", "") >= en: continue   # 同一檔多筆處置公告：取期間最晚者
            it(code)["p"] = dict(s=st, e=en, r=r[5].strip(), m=r[7].strip(), pub=roc8(r[1]), mt=("約每" + mm.group(1) + "分鐘撮合一次") if mm else None, cash=cash)
    else: errs.append("TWSE punish")
    # --- 上市 全額交割 ---
    tj = get("https://openapi.twse.com.tw/v1/exchangeReport/TWT85U")
    if tj is not None:
        for r in tj:
            if ok(r["Code"].strip()): it(r["Code"].strip())["f"] = dict(k="全額交割", per=r.get("PeriodicCallAuctionTrading", "").strip() == "**")
    else: errs.append("TWSE TWT85U")
    # --- 上櫃 ---
    tn = get("https://www.tpex.org.tw/openapi/v1/tpex_trading_warning_information")
    if tn is not None:
        for r in tn:
            code = r["SecuritiesCompanyCode"].strip()
            if ok(code): it(code).setdefault("n", []).append(dict(d=roc8(r["Date"]), c=None, t=re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", r["TradingInformation"])).strip()))
    else: errs.append("TPEx notice")
    td = get("https://www.tpex.org.tw/openapi/v1/tpex_disposal_information")
    if td is not None:
        for r in td:
            code = r["SecuritiesCompanyCode"].strip(); per = r["DispositionPeriod"].split("~")
            if not ok(code) or len(per) != 2: continue
            st, en = roc8(per[0]), roc8(per[1])
            if en < dd: continue
            cond = r.get("DisposalCondition") or ""; mm = re.search(r"約每\s*(\S{1,3}?)\s*分鐘", cond)
            if it(code).get("p", {}).get("e", "") >= en: continue
            it(code)["p"] = dict(s=st, e=en, r=r["DispositionReasons"].strip(), m=None, pub=roc8(r["Date"]), mt=("約每" + mm.group(1) + "分鐘撮合一次") if mm else None, cash="預收款券" in cond or "全部之買進價金" in cond)
    else: errs.append("TPEx disposal")
    tc = get("https://www.tpex.org.tw/openapi/v1/tpex_cmode")
    if tc is not None:
        for r in tc:
            code = r["SecuritiesCompanyCode"].strip()
            if not ok(code): continue
            e = it(code)
            if r.get("AlteredTrading", "").strip(): e["f"] = dict(k="全額交割（變更交易）", per=bool(r.get("PeriodicTrading", "").strip()))
            if r.get("ManagedStock", "").strip(): e["g"] = "管理股票"
            if r.get("SuspensionOfTrading", "").strip(): e["z"] = "停止交易"
    else: errs.append("TPEx cmode")
    if len(errs) >= 6: raise RuntimeError("處置注意來源全數失敗：" + ",".join(errs))
    old = {}
    try: old = json.loads((OUT / "flags.json").read_text())
    except Exception: pass
    if errs and old:   # 單一來源失敗：該來源沿用前次（以 stale 標示），其餘照常更新
        for tag, key in (("TWSE notice", "n"), ("TWSE punish", "p"), ("TWSE TWT85U", "f"), ("TPEx notice", "n"), ("TPEx disposal", "p"), ("TPEx cmode", "f")):
            if tag in errs:
                mk = "上市" if tag.startswith("TWSE") else "上櫃"
                for c, v in (old.get("items") or {}).items():
                    if key in v and c in stocks and stocks[c]["market"] == mk: it(c)[key] = v[key]
    avoid = sorted(c for c, v in items.items() if "p" in v or "f" in v or "g" in v or "z" in v)
    wjson("flags.json", dict(asof=dd, updated=now().isoformat(timespec="seconds"), errors=errs, items=items, avoid=avoid,
          noticeDays=sorted({n["d"] for v in items.values() for n in v.get("n", []) if n.get("d")})[-3:],
          sources=dict(twseNotice="https://www.twse.com.tw/rwd/zh/announcement/notice", twsePunish="https://www.twse.com.tw/rwd/zh/announcement/punish",
                       twseTWT85U="https://openapi.twse.com.tw/v1/exchangeReport/TWT85U", tpexNotice="https://www.tpex.org.tw/openapi/v1/tpex_trading_warning_information",
                       tpexDisposal="https://www.tpex.org.tw/openapi/v1/tpex_disposal_information", tpexCmode="https://www.tpex.org.tw/openapi/v1/tpex_cmode")))
    print("flags ok", dd, "items", len(items), "avoid", len(avoid), "errors", errs)

def main(which="all"):
    steps = dict(calendar=calendar, flags=flags)
    for k, fn in steps.items():
        if which in ("all", k):
            try: fn()
            except Exception as e: print(f"extra.{k} 失敗（保留前次資料）：{type(e).__name__}: {e}")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "all")
