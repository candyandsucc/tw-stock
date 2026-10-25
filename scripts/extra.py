#!/usr/bin/env python3
"""延伸官方資料：休市日程、處置／注意／全額交割標記、信用交易（融資融券借券）、外資持股比率。
只用證交所／櫃買中心官方公開資料；每一項獨立 try/except，單項失敗只保留前次資料並印出原因，不影響 daily workflow。
用法：python3 scripts/extra.py [calendar|flags|credit|all]"""
import json, math, re, sys, time, pathlib, datetime as dt, urllib.request
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

# ============ 3/4. 信用交易（融資、融券、借券賣出）與外資持股比率 ============
CREDIT_DAYS = 30
def cached(name, fetch):
    f = CACHE / name
    if f.exists():
        try: return json.loads(f.read_text())
        except Exception: pass
    v = fetch(); time.sleep(SLEEP)
    if v is not None: f.write_text(json.dumps(v, ensure_ascii=False, separators=(",", ":")))
    return v

def _tw_margin(d):
    j = get(f"https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={d.replace('-','')}&selectType=ALL&response=json")
    if not j or j.get("stat") != "OK" or j.get("date") != d.replace("-", ""): return None
    t = [t for t in j["tables"] if t.get("fields") and t["fields"][0] == "代號"]
    if not t or not t[0]["data"]: return None
    return {r[0].strip(): [num(r[6]), num(r[5]), num(r[7]), num(r[12]), num(r[11])] for r in t[0]["data"]}   # 融資餘額、前日、限額、融券餘額、前日（張）

def _tw_sbl(d):
    j = get(f"https://www.twse.com.tw/rwd/zh/marginTrading/TWT93U?date={d.replace('-','')}&response=json")
    if not j or j.get("stat") != "OK" or j.get("date") != d.replace("-", "") or not j.get("data"): return None
    return {r[0].strip(): [round((num(r[12]) or 0) / 1000, 3), round((num(r[8]) or 0) / 1000, 3)] for r in j["data"]}   # 借券賣出餘額、前日（股→張）

def _tp_margin(d):
    j = get(f"https://www.tpex.org.tw/www/zh-tw/margin/balance?date={d.replace('-','/')}&response=json")
    if not j or not j.get("tables") or not j["tables"][0].get("data") or j.get("date") != d.replace("-", ""): return None
    return {r[0].strip(): [num(r[6]), num(r[2]), num(r[9]), num(r[14]), num(r[10])] for r in j["tables"][0]["data"]}

def _tp_sbl(d):
    j = get(f"https://www.tpex.org.tw/www/zh-tw/margin/sbl?date={d.replace('-','/')}&response=json")
    if not j or not j.get("tables") or not j["tables"][0].get("data") or j.get("date") != d.replace("-", ""): return None
    return {r[0].strip(): [round((num(r[12]) or 0) / 1000, 3), round((num(r[8]) or 0) / 1000, 3)] for r in j["tables"][0]["data"]}

def _tw_qfii(d):
    j = get(f"https://www.twse.com.tw/rwd/zh/fund/MI_QFIIS?date={d.replace('-','')}&selectType=ALLBUT0999&response=json")
    if not j or j.get("stat") != "OK" or j.get("date") != d.replace("-", "") or not j.get("data"): return None
    return {r[0].strip(): num(r[7]) for r in j["data"]}

def _tp_qfii_latest():
    j = get("https://www.tpex.org.tw/openapi/v1/tpex_3insti_qfii")
    if not j: return None, None
    d = roc8(j[0]["Date"]); return d, {r["SecuritiesCompanyCode"].strip(): num(r["PercentageOfSharesOC/FMIHeld"]) for r in j}

def credit():
    """融資／融券／借券賣出餘額（張）與外資持股比率；逐日快取在 snapshots/chips/（crm、crs、crq 開頭），每天只補新交易日。輸出 credit.json。"""
    meta, stocks = _stocks()
    days = [r[0] for r in json.loads((HIS / "2330.json").read_text())["rows"]][-CREDIT_DAYS:]
    latest = meta["twseDate"]
    if latest and latest not in days: days = (days + [latest])[-CREDIT_DAYS:]
    cr = {}; qf = {}; got = dict(m=[], s=[], q=[])
    for d in days:
        for mk, fm, fs, fq in (("上市", _tw_margin, _tw_sbl, _tw_qfii), ("上櫃", _tp_margin, _tp_sbl, None)):
            m = cached(f"crm_{d}_{mk}.json", lambda: fm(d)); s = cached(f"crs_{d}_{mk}.json", lambda: fs(d))
            if m:
                if d not in got["m"]: got["m"].append(d)
                for c, v in m.items():
                    if c in stocks: cr.setdefault(c, {})[d] = list(v)
            if s:
                if d not in got["s"]: got["s"].append(d)
                for c, v in s.items():
                    if c in stocks and c in cr and d in cr[c]: cr[c][d] += v
            if fq:
                q = cached(f"crq_{d}_{mk}.json", lambda: fq(d))
                if q:
                    if d not in got["q"]: got["q"].append(d)
                    for c, v in q.items():
                        if c in stocks: qf.setdefault(c, {})[d] = v
    # 上櫃外資持股比率：櫃買 OpenAPI 只提供最新一日，之後每天累積快取
    try:
        d, q = _tp_qfii_latest()
        if d and q: (CACHE / f"crq_{d}_上櫃.json").write_text(json.dumps(q, ensure_ascii=False, separators=(",", ":")))
    except Exception as e: print("tpex qfii latest fail", e)
    for d in days:
        f = CACHE / f"crq_{d}_上櫃.json"
        if f.exists():
            q = json.loads(f.read_text())
            if d not in got["q"]: got["q"].append(d)
            for c, v in q.items():
                if c in stocks: qf.setdefault(c, {})[d] = v
    if not got["m"]: raise RuntimeError("融資融券來源全數取不到")
    # 輸出：每檔每日 [融資餘額, 前日, 融資限額, 融券餘額, 前日, 借券賣出餘額, 前日]；缺資料為 null
    data = {}
    for c, m in cr.items():
        row = [([None if x is None else round(x, 1) for x in m.get(d)] + [None] * (7 - len(m.get(d)))) if m.get(d) else None for d in days]
        if any(r and ((r[0] or 0) or (r[3] or 0) or (len(r) > 5 and (r[5] or 0))) for r in row): data[c] = row
    q = {c: [m.get(d) for d in days] for c, m in qf.items() if any(m.get(d) is not None for d in days)}
    wjson("credit.json", dict(days=days, got=got, data=data, qfii=q, updated=now().isoformat(timespec="seconds"),
          units="融資／融券／借券賣出：張；使用率＝融資餘額÷融資限額；外資持股比率：%",
          sources=dict(twseMargin="https://www.twse.com.tw/zh/trading/margin/mi-margn.html", twseSbl="https://www.twse.com.tw/zh/trading/margin/twt93u.html",
                       tpexMargin="https://www.tpex.org.tw/zh-tw/mainboard/trading/margin-trading/transactions.html", tpexSbl="https://www.tpex.org.tw/zh-tw/mainboard/trading/margin-trading/sbl.html",
                       twseQfii="https://www.twse.com.tw/zh/trading/foreign/mi-qfiis.html", tpexQfii="https://www.tpex.org.tw/openapi/v1/tpex_3insti_qfii")))
    print("credit ok", days[-1], "stocks", len(data), "qfii", len(q), got["m"][-1:], got["q"][-1:])
    for f in CACHE.glob("cr?_*.json"):   # 清掉超出窗口的快取
        if f.name.split("_")[1] not in set(days): f.unlink()

# ============ 衍生：清單排序用的籌碼摘要（連買連賣、5／20 日累計、信用使用率、外資持股比率） ============
def chipsum():
    """由 chips.json（T86／櫃買三大法人，近 20 日）與 credit.json 計算每檔摘要，輸出 chipsum.json（清單排序與總覽用）。純計算，不連網。"""
    ch = json.loads((OUT / "chips.json").read_text()); cr = json.loads((OUT / "credit.json").read_text()) if (OUT / "credit.json").exists() else None
    meta, stocks = _stocks(); days = ch["days"]; out = {}
    r0 = lambda v: None if v is None else round(v)
    for code, raw in ch["inst"].items():
        s = stocks.get(code)
        if not s: continue
        got = set(ch["instGot"].get(s["market"], []))
        ser = [(d, x) for d, x in zip(days, raw) if d in got]            # 該市場有資料的交易日（缺資料不當作零）
        if not ser or ser[-1][1] is None: continue
        def streak(k):
            n, sign = 0, 0
            for d, x in reversed(ser):
                v = x[k] if x else None
                if not v: break
                sg = 1 if v > 0 else -1
                if sign and sg != sign: break
                sign = sg; n += 1
            return sign * n
        def acc(k, w): return r0(sum((x[k] or 0) for _, x in ser[-w:] if x) / 1000)
        out.setdefault(code, {})["i"] = [streak(0), streak(1), streak(2), acc(0, 5), acc(0, 20), acc(1, 5), acc(1, 20), acc(2, 5), acc(2, 20), len(ser)]
    if cr:
        cd = cr["days"]
        for code, rows in cr["data"].items():
            idx = [i for i, r in enumerate(rows) if r and r[0] is not None]
            if not idx: continue
            L = idx[-1]; r = rows[L]
            def back(k, col):
                j = L - k
                return rows[j][col] if 0 <= j < len(rows) and rows[j] and rows[j][col] is not None else None
            mb = r[0]; use = round(mb / r[2] * 100, 2) if r[2] else None
            d = lambda cur, old: None if cur is None or old is None else round(cur - old, 3)
            sb = r[3]; sbl = r[5] if len(r) > 5 else None
            out.setdefault(code, {})["c"] = [mb, d(mb, r[1]), d(mb, back(5, 0)), d(mb, back(20, 0)), use, sb, d(sb, r[4]), d(sb, back(5, 3)),
                sbl, d(sbl, r[6] if len(r) > 6 else None), d(sbl, back(5, 5)), cd[L]]
        for code, ser in cr["qfii"].items():
            idx = [i for i, v in enumerate(ser) if v is not None]
            if not idx or code not in stocks: continue
            L = idx[-1]; b = lambda k: ser[L - k] if L - k >= 0 and ser[L - k] is not None else None
            out.setdefault(code, {})["q"] = [ser[L], None if b(5) is None else round(ser[L] - b(5), 2), None if b(20) is None else round(ser[L] - b(20), 2), cr["days"][L]]
    wjson("chipsum.json", dict(asof=ch["days"][-1], creditAsof=(cr or {}).get("days", [None])[-1], items=out,
          note="i=[外資連買(+)/連賣(−)天數,投信,自營,外資5日,外資20日,投信5日,投信20日,自營5日,自營20日,期間天數](張)；c=[融資餘額,單日增減,5日增減,20日增減,使用率%,融券餘額,單日,5日,借券賣出餘額,單日,5日,資料日]；q=[外資持股比率%,5日變化,20日變化,資料日]"))
    print("chipsum ok", len(out))


# ============ 6. 疑似未還原價格偵測（單日 |漲跌| > 11%） ============
GAP_TH = 0.11
GX_BUDGET = 420   # 秒：每次最多花多久查新的除權息日（斷點續跑靠 snapshots/chips/gx_*.json 快取）
def _exday(d):
    """該日的除權息計算結果（證交所 TWT49U、櫃買 exDailyQ）：{代號:[除權息前收盤價, 參考價]}；來源取不到回傳 None（不快取）。"""
    out = {}; ok = False
    j = get(f"https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate={d.replace('-','')}&endDate={d.replace('-','')}&response=json", tries=2); time.sleep(SLEEP)
    if j and j.get("stat") in ("OK", "很抱歉，沒有符合條件的資料!"):
        ok = True
        for r in j.get("data", []) if j.get("stat") == "OK" else []:
            p0, p1 = num(r[3]), num(r[4])
            if p0 and p1: out[r[1].strip()] = [p0, p1]
    y, m, dd = d.split("-")
    j = get(f"https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate={y}/{m}/{dd}&endDate={y}/{m}/{dd}&response=json", tries=2); time.sleep(SLEEP)
    if j is not None:
        ok = ok and True
        for r in (j.get("tables") or [{}])[0].get("data", []):
            p0, p1 = num(r[3]), num(r[4])
            if p0 and p1: out[r[1].strip()] = [p0, p1]
    elif ok: return None
    return out if ok else None

def gaps():
    """掃描 site/data/history/*.json（已含官方除權還原）：還有單日 |漲跌| > 11% 的跳空者，查該日是否為官方除權息日。
    非除權息日（或收盤偏離官方參考價 > 10.5%）→ 疑似分割／減資／面額變更／未還原：MA5／MA20／MA60 與 60 日高改以事件日起的資料計算，不足則為 null。輸出 gaps.json，並在該檔歷史補上 gaps 欄位。"""
    cand = {}
    for f in sorted(HIS.glob("*.json")):
        try: h = json.loads(f.read_text())
        except Exception: continue
        r = h["rows"]; ev = []
        for i in range(1, len(r)):
            if r[i][4] and r[i-1][4] and abs(r[i][4] / r[i-1][4] - 1) > GAP_TH: ev.append(i)
        cand[h["code"]] = (f, h, ev)
    dates = sorted({cand[c][1]["rows"][i][0] for c in cand for i in cand[c][2]})
    ex = {}; t0 = time.time()
    for d in dates:
        if time.time() - t0 > GX_BUDGET and not (CACHE / f"gx_{d}.json").exists(): continue    # 預算：新日期查詢超過上限就先略過（該日顯示「官方資料當日取不到」，下次續查；已快取的日期不受影響）
        v = cached(f"gx_{d}.json", lambda: _exday(d))
        if v is not None: ex[d] = v
    summary = {}
    for c, (f, h, evs) in cand.items():
        r = h["rows"]; cl = [x[4] for x in r]; n = len(r); info = []
        for i in evs:
            d = r[i][0]; chg = cl[i] / cl[i-1] - 1; e = (ex.get(d) or {}).get(c)
            kind = "ex" if e and abs(cl[i] / e[1] - 1) <= 0.105 else "sus" if d in ex else "unk"   # unk：官方除權息資料當日取不到
            info.append(dict(d=d, pct=round(chg * 100, 1), prev=cl[i-1], c=cl[i], kind=kind, ref=e[1] if e else None, big=abs(chg) >= 0.4))
        sus = [e for e in info if e["kind"] != "ex"]
        start = next((i for i in range(n) if r[i][0] == sus[-1]["d"]), 0) if sus else 0
        post = r[start:]; pc = [x[4] for x in post]
        sm = lambda k: round(sum(pc[-k:]) / k, 2) if len(pc) >= k else None
        g = dict(ev=info, suspect=bool(sus), since=sus[-1]["d"] if sus else None, nAfter=len(post), rows=n,
                 ma60raw=h.get("ma60"), hi60=max(x[2] for x in post[-60:]) if sus else None, hi60raw=max(x[2] for x in r[-60:]) if sus else None)
        if info or n < 60: h["gaps"] = g
        else: h.pop("gaps", None)
        if sus: h["ma5"], h["ma20"], h["ma60"] = sm(5), sm(20), sm(60)
        if info or n < 60 or "gaps" in h: f.write_text(json.dumps(h, ensure_ascii=False))
        if info: summary[c] = dict(ev=info, suspect=bool(sus), since=g["since"], nAfter=g["nAfter"])
    wjson("gaps.json", dict(threshold=GAP_TH * 100, items=summary, asof=max((h["date"] for _, h, _ in cand.values()), default=None), updated=now().isoformat(timespec="seconds"),
          sources=dict(twse="https://www.twse.com.tw/zh/exRight/TWT49U.html", tpex="https://www.tpex.org.tw/zh-tw/mainboard/trading/exright/calculation.html")))
    print("gaps ok", {c: [(e["d"], e["pct"], e["kind"]) for e in v["ev"]] for c, v in summary.items()})


# ============ 第二批：重大訊息累積、除權息／法說會日程、指標快照 ============
NEWS = ROOT / "snapshots" / "news"
def _roc_cn(s):   # 115年11月06日 -> 2026-11-06
    m = re.match(r"\s*(\d+)年(\d+)月(\d+)日", str(s or ""))
    return f"{int(m[1]) + 1911}-{int(m[2]):02d}-{int(m[3]):02d}" if m else None
def _clean(t, n=None):
    t = re.sub(r"<[^>]+>", "", str(t or "")).replace("\r", "").strip()
    t = re.sub(r"\n+", " ", t)
    return t[:n] if n else t

def news_fetch():
    """證交所 t187ap04_L、櫃買 mopsfin_t187ap04_O（公開資訊觀測站每日重大訊息；OpenAPI 只給當日）→ 逐日存檔 snapshots/news/，保留 45 天。"""
    NEWS.mkdir(parents=True, exist_ok=True)
    out = []
    a = get("https://openapi.twse.com.tw/v1/opendata/t187ap04_L"); b = get("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O")
    if a is None and b is None: raise RuntimeError("重大訊息兩來源皆取不到")
    for r in a or []:
        out.append(dict(c=str(r.get("公司代號", "")).strip(), n=r.get("公司名稱", "").strip(), mk="上市", d=roc8(r.get("發言日期")), t=str(r.get("發言時間", "")).zfill(6),
                        s=_clean(r.get("主旨 ") or r.get("主旨"), 160), k=_clean(r.get("符合條款"), 12), f=roc8(r.get("事實發生日")) if r.get("事實發生日") else None, x=_clean(r.get("說明"), 700)))
    for r in b or []:
        out.append(dict(c=str(r.get("SecuritiesCompanyCode", "")).strip(), n=r.get("CompanyName", "").strip(), mk="上櫃", d=roc8(r.get("發言日期")), t=str(r.get("發言時間", "")).zfill(6),
                        s=_clean(r.get("主旨"), 160), k=_clean(r.get("符合條款"), 12), f=roc8(r.get("事實發生日")) if r.get("事實發生日") else None, x=_clean(r.get("說明"), 700)))
    by = {}
    for x in out:
        if x["d"] and x["c"]: by.setdefault(x["d"], []).append(x)
    for d, v in by.items():     # 以「發言日期」分檔；同一天重跑會合併去重
        f = NEWS / f"{d}.json"; old = []
        if f.exists():
            try: old = json.loads(f.read_text())
            except Exception: pass
        key = lambda x: (x["c"], x["t"], x["s"])
        seen = {key(x): x for x in old}
        for x in v: seen[key(x)] = x
        f.write_text(json.dumps(sorted(seen.values(), key=lambda x: (x["d"], x["t"])), ensure_ascii=False, separators=(",", ":")))
    cut = (now().date() - dt.timedelta(days=45)).isoformat()
    for f in NEWS.glob("*.json"):
        if f.stem < cut: f.unlink()
    return len(out)

def _news_all():
    items = []
    for f in sorted(NEWS.glob("*.json")):
        try: items += json.loads(f.read_text())
        except Exception: pass
    return items

def events():
    """日程：除權息（證交所 TWT48U 預告表、櫃買 tpex_exright_prepost）＋ 法說會（由公開資訊觀測站重大訊息「召開法人說明會」累積，取不到 MOPS 法說會一覽表）＋ 財報法定申報期限。輸出 events.json、news.json。"""
    old = {}
    try: old = json.loads((OUT / "events.json").read_text())
    except Exception: pass
    errs = {}
    try: nn = news_fetch(); print("news fetched", nn)
    except Exception as e: errs["news"] = str(e); print("news fail", e)
    today = now().date(); a = (today - dt.timedelta(days=5)); b = today + dt.timedelta(days=120)
    ex = []; okx = False
    j = get(f"https://www.twse.com.tw/rwd/zh/exRight/TWT48U?response=json&strDate={a:%Y%m%d}&endDate={b:%Y%m%d}", tries=2)
    if j and j.get("stat") == "OK":
        okx = True
        for r in j["data"]:
            d = _roc_cn(r[0])
            if not d: continue
            cash = num(r[7]) if re.match(r"^[\d.]+$", str(r[7]).strip()) else None
            ex.append(dict(d=d, c=r[1].strip(), n=r[2].strip(), mk="上市", k={"息": "除息", "權": "除權"}.get(r[3].strip(), r[3].strip()), cash=cash, stock=num(r[4]), ref=None,
                           note=_clean(r[7]) if cash is None else None))
    time.sleep(SLEEP)
    j = get("https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost", tries=2)
    if j:
        okx = True
        for r in j:
            d = roc8(r.get("ExRrightsExDividendDate"))
            if not d or d < a.isoformat() or d > b.isoformat(): continue
            ex.append(dict(d=d, c=str(r["SecuritiesCompanyCode"]).strip(), n=r["CompanyName"].strip(), mk="上櫃", k=r["ExRrightsExDividend"].strip(), cash=num(r.get("CashDividend")), stock=num(r.get("StockDividendRatio")), ref=None, note=None))
    if not okx: ex = old.get("ex", []); errs["ex"] = "除權息來源取不到，保留前次"
    ex.sort(key=lambda x: (x["d"], x["c"]))
    # 法說會
    ir = []
    for x in _news_all():
        if not (("法人說明會" in x["s"]) or ("法說會" in x["s"])): continue
        m = re.search(r"召開法人說明會之日期：\s*(\d+)/(\d+)/(\d+)", x["x"]) or re.search(r"(?:日期|事實發生日)[:：]\s*(\d{3})/(\d{2})/(\d{2})", x["x"])
        d = f"{int(m[1]) + 1911}-{int(m[2]):02d}-{int(m[3]):02d}" if m else x.get("f")
        if not d: continue
        tm = re.search(r"時間：\s*(\d+)\s*時\s*(\d+)?", x["x"]); pl = re.search(r"地點：\s*([^\d][^4]{0,60}?)(?:\s*4\.|$)", x["x"])
        ir.append(dict(d=d, tm=f"{int(tm[1]):02d}:{int(tm[2] or 0):02d}" if tm else None, c=x["c"], n=x["n"], mk=x["mk"], s=x["s"], ann=x["d"], pl=pl[1].strip()[:60] if pl else None))
    ir = list({(i["c"], i["d"], i["s"]): i for i in ir}.values()); ir.sort(key=lambda i: (i["d"], i["c"]))
    # 財報法定申報期限（規則推算：證券交易法第 36 條；一般產業公司；非個別公司公告日）
    fin = []
    for y in (today.year - 1, today.year, today.year + 1):
        for md, lab in (("03-31", f"{y - 1} 年度財報（年報）"), ("05-15", f"{y} 第一季財報"), ("08-14", f"{y} 第二季財報"), ("11-14", f"{y} 第三季財報")):
            d = f"{y}-{md}"
            if a.isoformat() <= d <= b.isoformat(): fin.append(dict(d=d, t=lab + "申報期限（一般產業）"))
    wjson("events.json", dict(ex=ex, ir=ir, fin=fin, asof=today.isoformat(), errors=errs, updated=now().isoformat(timespec="seconds"),
          sources=dict(ex="https://www.twse.com.tw/zh/exRight/TWT48U.html；https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost", ir="公開資訊觀測站重大訊息（證交所 t187ap04_L、櫃買 mopsfin_t187ap04_O，第 12 款召開法人說明會）", fin="證券交易法第 36 條（法定申報期限）"),
          irNote="MOPS 法人說明會一覽表網頁拒絕程式存取，未繞過；法說會日程改由每日重大訊息累積，只含站台開始存檔（見 irSince）之後公告者。", irSince=min((p.stem for p in NEWS.glob('*.json')), default=None)))
    # 個股重大訊息（近 30 天，新到舊）
    cut = (today - dt.timedelta(days=30)).isoformat(); nw = {}
    for x in _news_all():
        if x["d"] and x["d"] >= cut: nw.setdefault(x["c"], []).append([x["d"], x["t"], x["s"], x["k"], x["f"], x["x"][:300]])
    for c in nw: nw[c].sort(key=lambda r: (r[0], r[1]), reverse=True)
    if nw or not (OUT / "news.json").exists():
        wjson("news.json", dict(items=nw, asof=today.isoformat(), days=sorted({p.stem for p in NEWS.glob('*.json')}), updated=now().isoformat(timespec="seconds"),
              fields=["發言日期", "發言時間", "主旨", "符合條款", "事實發生日", "說明摘要"], sources=dict(twse="https://openapi.twse.com.tw/v1/opendata/t187ap04_L", tpex="https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O")))
    print("events ok ex", len(ex), "ir", len(ir), "news codes", len(nw), errs)

def _tk(p): return 0.01 if p < 10 else 0.05 if p < 50 else 0.1 if p < 100 else 0.5 if p < 500 else 1 if p < 1000 else 5
def metrics():
    """由歷史價量算出每檔的篩選／族群用指標（站內資料，不連網）→ metrics.json。"""
    st = {s["code"]: s for s in json.loads((OUT / "stocks.json").read_text())["stocks"]}
    items = {}; latest = None
    for f in sorted(HIS.glob("*.json")):
        try: h = json.loads(f.read_text())
        except Exception: continue
        s = st.get(h["code"])
        if not s or h["date"] != s["date"]: continue
        r = h["rows"]; n = len(r); cl = [x[4] for x in r]; c = cl[-1]
        if n < 6: continue
        g = h.get("gaps") or {}; start = next((i for i in range(n) if r[i][0] == g["since"]), 0) if g.get("suspect") else 0
        ret = lambda k: round((c / cl[-1 - k] - 1) * 100, 2) if n > k and n - 1 - k >= start else None
        L = h.get("levels") or {}; s1 = (L.get("support") or [None])[0]; r1 = (L.get("resistance") or [None])[0]
        ds = round((c / s1["high"] - 1) * 100, 2) if s1 else None
        rr = None
        if s1 and r1:
            stop = math.floor(s1["low"] * 0.99 / _tk(s1["low"] * 0.99) + 1e-9) * _tk(s1["low"] * 0.99)
            if c > stop and r1["low"] > c: rr = round((r1["low"] - c) / (c - stop), 2)
        m5, m20, m60 = h.get("ma5"), h.get("ma20"), h.get("ma60")
        hi = lambda k: max(x[2] for x in r[-1 - k:-1]) if n > k and n - 1 - k >= start else None
        h10, h20 = hi(10), hi(20)
        items[h["code"]] = [c, ret(5), ret(20), ds, rr, round((c / m20 - 1) * 100, 2) if m20 else None, h.get("volRatio"), 1 if c > r[-1][1] else 0,
                            None if h10 is None else int(c > h10), None if h20 is None else int(c > h20),
                            None if not m5 else int(c > m5), None if not m20 else int(c > m20), None if not m60 else int(c > m60),
                            None if not (m5 and m20 and m60) else int(m5 > m20 > m60), None if not s1 else int(c >= s1["low"])]
        latest = h["date"]
    wjson("metrics.json", dict(date=latest, n=len(items), fields=["close", "r5", "r20", "distSupport", "rr", "bias20", "volRatio", "red", "brk10", "brk20", "aboveMA5", "aboveMA20", "aboveMA60", "bull", "supHold"],
          items=items, note="distSupport＝收盤÷第一支撐帶上緣−1（%，負值＝已在帶內或跌破）；rr＝(第一壓力下緣−收盤)÷(收盤−停損)，停損＝第一支撐帶下緣×0.99；brk＝收盤高於前 10／20 日最高價；皆由站內歷史價量計算，非買賣建議"))
    print("metrics ok", len(items))

# ============ 第二批（段二）：財報、股利／填息、估值歷史、集保大戶、當沖比 ============
SNAP = ROOT / "snapshots"
def _stockset():
    return {x["code"]: x for x in json.loads((OUT / "stocks.json").read_text())["stocks"]}
def _roc_iso(s):
    s = str(s or "").strip()
    return roc8(s) if re.match(r"^\d{6,7}$", s) else None

def fin():
    """營益分析（毛利率、營益率、淨利率：證交所 t187ap17_L、櫃買 187ap17_O）＋ 綜合損益表（EPS、淨利：t187ap06 各產業別）。單季資料；每個（年度,季別）存檔 snapshots/fin/，歷史從站台開始存檔後逐季累積。輸出 fin.json。"""
    FD = SNAP / "fin"; FD.mkdir(parents=True, exist_ok=True)
    st = _stockset(); per = {}   # (y,s) -> {code: dict}
    def put(code, y, q, **kw):
        if code in st and y and q: per.setdefault((int(y), int(q)), {}).setdefault(code, {}).update(kw)
    a = get("https://openapi.twse.com.tw/v1/opendata/t187ap17_L"); b = get("https://www.tpex.org.tw/openapi/v1/mopsfin_187ap17_O")
    if a is None and b is None: raise RuntimeError("營益分析兩來源皆取不到")
    out_d = None
    for r in a or []:
        out_d = out_d or roc8(r.get("出表日期"))
        put(str(r["公司代號"]).strip(), r.get("年度"), r.get("季別"), rev=num(r.get("營業收入(百萬元)")), gm=num(r.get("毛利率(%)(營業毛利)/(營業收入)")), om=num(r.get("營業利益率(%)(營業利益)/(營業收入)")), nm=num(r.get("稅後純益率(%)(稅後純益)/(營業收入)")))
    for r in b or []:
        out_d = out_d or roc8(r.get("Date"))
        put(str(r["SecuritiesCompanyCode"]).strip(), r.get("Year"), r.get("季別"), rev=num(r.get("營業收入百萬元")), gm=num(r.get("毛利率")), om=num(r.get("營業利益率")), nm=num(r.get("稅後純益率")))
    def g(r, *ks):
        for k in ks:
            if k in r: return r[k]
        return None
    fams = [("https://openapi.twse.com.tw/v1/opendata/t187ap06_L_%s", ("bd", "ci", "fh", "ins", "mim")),
            ("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_%s", ("basi", "bd", "ci", "fh", "ins", "mim"))]
    for url, fm in fams:
        for f in fm:
            j = get(url % f, tries=2); time.sleep(SLEEP)
            for r in j or []:
                code = str(g(r, "公司代號", "SecuritiesCompanyCode") or "").strip()
                if not code: continue
                ni = num(g(r, "淨利（淨損）歸屬於母公司業主", "淨利（損）歸屬於母公司業主", "淨利（淨損）歸屬於母公司業主"))
                if ni is None: ni = num(g(r, "本期淨利（淨損）", "本期稅後淨利（淨損）"))
                put(code, g(r, "年度", "Year"), g(r, "季別", "Season"), eps=num(g(r, "基本每股盈餘（元）")), ni=ni)
    for (y, q), d in per.items():    # 逐季存檔（同一季重跑覆蓋）
        (FD / f"{y}Q{q}.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    items = {}
    snaps = sorted((tuple(map(int, f.stem.split("Q"))), f) for f in FD.glob("*Q*.json"))
    for (y, q), f in snaps:
        for c, v in json.loads(f.read_text()).items():
            items.setdefault(c, []).append([y + 1911, q, v.get("rev"), v.get("gm"), v.get("om"), v.get("nm"), v.get("eps"), v.get("ni")])
    for c in items: items[c].sort(key=lambda r: (r[0], r[1]), reverse=True); items[c] = items[c][:12]
    wjson("fin.json", dict(items=items, fields=["西元年", "季別", "營收(百萬元)", "毛利率%", "營益率%", "稅後淨利率%", "基本EPS(元)", "本期淨利(千元)"], asof=out_d, quarters=sorted({f"{y + 1911}Q{q}" for (y, q), _ in snaps}),
          updated=now().isoformat(timespec="seconds"), note="單季數字（非累計）；官方彙總表只提供最新一季，本站自開始存檔起逐季累積，累積不足 4 季時不計近四季 EPS。",
          sources=dict(twse="https://openapi.twse.com.tw/v1/opendata/t187ap17_L、t187ap06_L_*", tpex="https://www.tpex.org.tw/openapi/v1/mopsfin_187ap17_O、mopsfin_t187ap06_O_*")))
    print("fin ok", len(items), "quarters", sorted(f"{y + 1911}Q{q}" for (y, q), _ in snaps), "asof", out_d)

def _fnum(x):
    v = num(x); return v if v is not None else 0.0
def dividends():
    """股利分派（證交所 t187ap45_L、櫃買 mopsfin_t187ap39_O）＋ 填息紀錄（證交所 TWT49U、櫃買 exDailyQ 的除權息前收盤價，對照本站歷史收盤）。輸出 div.json。"""
    st = _stockset(); items = {}
    a = get("https://openapi.twse.com.tw/v1/opendata/t187ap45_L")
    for r in a or []:
        c = str(r["公司代號"]).strip()
        if c not in st: continue
        cash = _fnum(r.get("股東配發-盈餘分配之現金股利(元/股)")) + _fnum(r.get("股東配發-法定盈餘公積發放之現金(元/股)")) + _fnum(r.get("股東配發-資本公積發放之現金(元/股)"))
        stock = _fnum(r.get("股東配發-盈餘轉增資配股(元/股)")) + _fnum(r.get("股東配發-法定盈餘公積轉增資配股(元/股)")) + _fnum(r.get("股東配發-資本公積轉增資配股(元/股)"))
        items.setdefault(c, dict(h=[], x=[]))["h"].append([int(r["股利年度"]) + 1911 if str(r["股利年度"]).isdigit() else None, _clean(r.get("股利所屬年(季)度") or "", 8), _clean(r.get("股利所屬期間"), 20), round(cash, 6), round(stock, 6),
                _clean(r.get("決議（擬議）進度"), 10), roc8(r.get("股東會日期")) if r.get("股東會日期") else None, roc8(r.get("董事會（擬議）股利分派日")) if r.get("董事會（擬議）股利分派日") else None, num(r.get("本期淨利(淨損)(元)")), num(r.get("股東配發-股東配發之現金(股利)總金額(元)"))])
    b = None
    for k in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap39_O", headers=UA), timeout=120) as rr: b = json.loads(rr.read().decode("utf-8", "replace"))
            break
        except Exception as e: print("tpex ap39 retry", k, type(e).__name__, e); time.sleep(3 * (k + 1))
    if b is None:    # 櫃買取不到：保留前次的上櫃股利資料
        try:
            for c, v in json.loads((OUT / "div.json").read_text())["items"].items():
                if c not in items and st.get(c, {}).get("market") != "上市": items[c] = dict(h=v.get("h", []), x=[])
        except Exception: pass
    if a is None and b is None: raise RuntimeError("股利分派兩來源皆取不到")
    for r in b or []:
        c = str(r["公司代號"]).strip()
        if c not in st: continue
        cash = _fnum(r.get("股東配發內容-盈餘分配之現金股利(元/股)")) + _fnum(r.get("股東配發內容-法定盈餘公積、資本公積發放之現金(元/股)"))
        stock = _fnum(r.get("股東配發內容-盈餘轉增資配股(元/股)")) + _fnum(r.get("股東配發內容-法定盈餘公積、資本公積轉增資配股(元/股)"))
        items.setdefault(c, dict(h=[], x=[]))["h"].append([int(r["股利年度"]) + 1911 if str(r["股利年度"]).isdigit() else None, _clean(r.get("期別"), 8), None, round(cash, 6), round(stock, 6), "董事會通過", None, roc8(r.get("董事會決議通過股利分派日")) if r.get("董事會決議通過股利分派日") else None,
                num(r.get("本期淨利(淨損)(元)")), num(r.get("股東配發內容-股東配發之現金(股利)總金額(元)"))])
    for c, v in items.items():
        uniq = {(h[0], h[1], h[2]): h for h in v["h"]}      # 同年度同期別只留一筆
        v["h"] = sorted(uniq.values(), key=lambda h: (h[0] or 0, h[1]), reverse=True)[:10]
    # 填息：除權息日（過去 150 天內）前收盤 vs 之後收盤
    today = now().date(); y, m = (today - dt.timedelta(days=150)).year, (today - dt.timedelta(days=150)).month
    evs = {}
    while (y, m) <= (today.year, today.month):
        import calendar as _cal
        last = _cal.monthrange(y, m)[1]
        j = get(f"https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate={y}{m:02d}01&endDate={y}{m:02d}{last}&response=json", tries=2); time.sleep(SLEEP)
        for r in (j or {}).get("data", []) if j and j.get("stat") == "OK" else []:
            d = _roc_cn(r[0]); p0, p1 = num(r[3]), num(r[4])
            if d and p0: evs.setdefault(r[1].strip(), []).append((d, p0, p1, str(r[6]).strip() if len(r) > 6 else ""))
        j = get(f"https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate={y}/{m:02d}/01&endDate={y}/{m:02d}/{last}&response=json", tries=2); time.sleep(SLEEP)
        for r in ((j or {}).get("tables") or [{}])[0].get("data", []):
            s_ = r[0].replace("/", ""); d = f"{int(s_[:-4]) + 1911}-{s_[-4:-2]}-{s_[-2:]}"; p0, p1 = num(r[3]), num(r[4])
            if p0: evs.setdefault(r[1].strip(), []).append((d, p0, p1, str(r[8]).strip() if len(r) > 8 else ""))
        m += 1
        if m == 13: y, m = y + 1, 1
    nfill = 0
    for c, L in evs.items():
        f = HIS / f"{c}.json"
        if c not in st or not f.exists(): continue
        rows = json.loads(f.read_text())["rows"]; dates = [r[0] for r in rows]
        for d, p0, p1, typ in sorted(L):
            if d < dates[0] or d > dates[-1]: continue
            i = next(k for k, x in enumerate(dates) if x >= d)
            fill = next((k for k in range(i, len(rows)) if rows[k][4] >= p0), None)
            e = dict(d=d, p0=p0, ref=p1, typ=typ, last=rows[-1][4], lastd=dates[-1])
            if fill is not None: e.update(fd=dates[fill], days=fill - i + 1)
            else: e.update(gap=round((p0 / rows[-1][4] - 1) * 100, 2), days=len(rows) - i)
            items.setdefault(c, dict(h=[], x=[]))["x"].append(e); nfill += 1
    wjson("div.json", dict(items=items, updated=now().isoformat(timespec="seconds"), n=len(items), nEx=nfill,
          note="現金股利＝盈餘分配＋公積發放（元/股）；配息率＝現金股利總額÷本期淨利（該筆公告內之數字，非 EPS 口徑，淨利為負不計）；填息＝除權息日起收盤價首次不低於除權息前收盤價（以本站歷史收盤對照，僅涵蓋有歷史資料且除權息日在歷史範圍內者）。",
          sources=dict(twse="https://openapi.twse.com.tw/v1/opendata/t187ap45_L；https://www.twse.com.tw/zh/exRight/TWT49U.html", tpex="https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap39_O；exDailyQ")))
    print("dividends ok", len(items), "ex records", nfill)

VAL_DAYS = 65
def _tw_val(d):
    j = get(f"https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date={d.replace('-', '')}&selectType=ALL&response=json", tries=2)
    if not j or j.get("stat") != "OK": return None
    return {r[0].strip(): [num(r[5]), num(r[3]), num(r[6])] for r in j["data"]}      # 本益比、殖利率、股價淨值比
def _tp_val(d):
    y, m, dd = d.split("-")
    j = get(f"https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryDate?date={y}/{m}/{dd}&id=&response=json", tries=2)
    t = ((j or {}).get("tables") or [None])[0]
    if not t or not t.get("data"): return None
    return {r[0].strip(): [num(r[2]), num(r[5]), num(r[6])] for r in t["data"]}
def valhist():
    """估值歷史分位：證交所 BWIBBU_d、櫃買 peQryDate 逐日（官方「依日期查詢」）近 65 個交易日，逐日快取 snapshots/chips/val_*；之後每天只補新日。輸出 valhist.json（本益比／殖利率／淨值比的現值、分位、區間）。"""
    meta = json.loads((OUT / "stocks.json").read_text())["meta"]
    days = [r[0] for r in json.loads((HIS / "2330.json").read_text())["rows"]][-VAL_DAYS:]
    if meta["twseDate"] and meta["twseDate"] not in days: days = (days + [meta["twseDate"]])[-VAL_DAYS:]
    old_days = sorted({f.name.split("_")[1] for f in CACHE.glob("val_*.json")})   # 已存檔的更早日期持續保留，窗口逐日加長（上限 260 日）
    days = sorted(set(days) | set(old_days))[-260:]
    st = _stockset(); ser = {}; got = []
    for d in days:
        ok = False
        for mk, fn in (("上市", _tw_val), ("上櫃", _tp_val)):
            v = cached(f"val_{d}_{mk}.json", lambda: fn(d))
            if v:
                ok = True
                for c, x in v.items():
                    if c in st: ser.setdefault(c, {})[d] = x
        if ok: got.append(d)
    if not got: raise RuntimeError("估值逐日資料全數取不到")
    def stat(vals):
        a = [v for v in vals if v is not None]
        if not a: return None
        cur = vals[-1]
        if cur is None: return dict(n=len(a), cur=None)
        pct = sum(1 for v in a if v <= cur) / len(a) * 100
        b = sorted(a); med = b[len(b) // 2] if len(b) % 2 else (b[len(b) // 2 - 1] + b[len(b) // 2]) / 2
        return dict(n=len(a), cur=cur, pct=round(pct, 1), lo=min(a), med=round(med, 2), hi=max(a))
    items = {}
    for c, m in ser.items():
        cols = [[m.get(d, [None] * 3)[k] if m.get(d) else None for d in got] for k in range(3)]
        keep = (HIS / f"{c}.json").exists()
        items[c] = dict(pe=stat(cols[0]), yd=stat(cols[1]), pb=stat(cols[2]), **({"s": [[None if v is None else round(v, 2) for v in col] for col in cols]} if keep else {}))
    wjson("valhist.json", dict(days=got, items=items, minN=60, updated=now().isoformat(timespec="seconds"),
          note="分位＝近期各交易日中，估值不高於今日者占比（0%＝區間最低、100%＝最高）；本益比為負或未列入的日子不計；起始窗口為官方逐日查詢可回補的近 65 個交易日，並自今日起每天繼續累積（上限 260 日），不足 60 個有效日時只標示資料不足、不顯示分位。",
          sources=dict(twse="https://www.twse.com.tw/zh/trading/exchange/BWIBBU_d.html", tpex="https://www.tpex.org.tw/zh-tw/mainboard/trading/info/pe-ratio-daily.html")))
    for f in CACHE.glob("val_*.json"):
        if f.name.split("_")[1] not in set(days): f.unlink()
    print("valhist ok", got[0], got[-1], len(got), "stocks", len(items))

def tdcc():
    """集保戶股權分散表（集保開放資料 1-5，每週）：大戶（>400 張）、千張大戶、散戶（≤10 張）持股比與人數；逐週存檔 snapshots/tdcc/ 累積趨勢。輸出 tdcc.json。"""
    TD = SNAP / "tdcc"; TD.mkdir(parents=True, exist_ok=True)
    st = _stockset()
    req = urllib.request.Request("https://opendata.tdcc.com.tw/getOD.ashx?id=1-5", headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r: txt = r.read().decode("utf-8-sig", "replace")
    rows = {}; date = None
    for ln in txt.splitlines()[1:]:
        p = ln.split(",")
        if len(p) < 6: continue
        d, c, lv = p[0], p[1].strip(), int(p[2]) if p[2].isdigit() else 0
        if c not in st or not 1 <= lv <= 17: continue
        date = d; rows.setdefault(c, {})[lv] = (int(p[3] or 0), int(p[4] or 0), float(p[5] or 0))
    if not rows or not date: raise RuntimeError("集保股權分散表解析不到資料")
    iso = f"{date[:4]}-{date[4:6]}-{date[6:]}"; cur = {}
    for c, L in rows.items():
        if 17 not in L: continue
        big = sum(L.get(k, (0, 0, 0))[2] for k in (12, 13, 14, 15)); k1 = L.get(15, (0, 0, 0))[2]; rt = sum(L.get(k, (0, 0, 0))[2] for k in (1, 2, 3))
        cur[c] = [round(big, 2), round(k1, 2), round(rt, 2), L[17][0], sum(L.get(k, (0, 0, 0))[0] for k in (12, 13, 14, 15)), L.get(15, (0, 0, 0))[0], [L.get(k, (0, 0, 0))[2] for k in range(1, 16)], [L.get(k, (0, 0, 0))[0] for k in range(1, 16)]]
    (TD / f"{iso}.json").write_text(json.dumps({c: v[:6] for c, v in cur.items()}, separators=(",", ":")))
    for f in sorted(TD.glob("*.json"))[:-26]: f.unlink()
    trend = {}
    for f in sorted(TD.glob("*.json")):
        for c, v in json.loads(f.read_text()).items(): trend.setdefault(c, []).append([f.stem] + v)
    wjson("tdcc.json", dict(date=iso, items=cur, trend={c: t for c, t in trend.items() if len(t) > 1 or True}, weeks=sorted(p.stem for p in TD.glob("*.json")), updated=now().isoformat(timespec="seconds"),
          levels=["1–999 股", "1,000–5,000", "5,001–10,000", "10,001–15,000", "15,001–20,000", "20,001–30,000", "30,001–40,000", "40,001–50,000", "50,001–100,000", "100,001–200,000", "200,001–400,000", "400,001–600,000", "600,001–800,000", "800,001–1,000,000", "1,000,001 以上"],
          note="大戶＝持股 400 張（400,001 股）以上；千張大戶＝1,000 張以上；散戶＝10 張（10,000 股）以下；比例為占集保庫存數；每週公布一次，趨勢自本站開始存檔起逐週累積。",
          source="https://www.tdcc.com.tw/portal/zh/smWeb/qryStock（集保開放資料 https://opendata.tdcc.com.tw/getOD.ashx?id=1-5）"))
    print("tdcc ok", iso, len(cur), "weeks", len(list(TD.glob('*.json'))))

# ============ 階段2：籌碼旗標與燈號（純計算，不連網；任何一步失敗都由 main 容錯，不影響每日更新） ============
SBL_PCT, SBL_VOL, MH_PCT, MH_RET, MH_USE = 10.0, 0.2, 8.0, 3.0, 10.0   # 借券賣壓累積／融資追價過熱 門檻（嚴格，沒達標就不標）
def chipflags():
    """由 credit.json、chipsum.json、tdcc.json 與歷史價量，算出每檔的「借券賣壓累積」「融資追價過熱」旗標與籌碼燈號 → chipflags.json。
    借券賣壓累積＝借券賣出餘額 5 日增加 ≥10%、增加量 ≥ 20 日均量 20%、且 20 日餘額也增加；
    融資追價過熱＝融資餘額 5 日增加 ≥8%、收盤 5 日漲幅 ≥3%、融資使用率 ≥10%。燈號：綠＝偏穩／偏多、黃＝留意／分歧、紅＝警示／偏空、灰＝無資料；都是觀察標示，不是買賣訊號。"""
    cr = json.loads((OUT / "credit.json").read_text()); cs = json.loads((OUT / "chipsum.json").read_text())["items"]
    td = json.loads((OUT / "tdcc.json").read_text()) if (OUT / "tdcc.json").exists() else {"trend": {}, "weeks": []}
    days = cr["days"]; items = {}; nS = nM = 0
    f1 = lambda v, d=1: "—" if v is None else f"{v:,.{d}f}"
    sg = lambda v, d=0: "—" if v is None else f"{v:+,.{d}f}"
    codes = set(cs) | set(cr["data"]) | set(td["trend"])
    for code in codes:
        hp = HIS / f"{code}.json"
        try: rows = json.loads(hp.read_text())["rows"] if hp.exists() else None
        except Exception: rows = None
        o = {}; lights = []
        c = (cs.get(code) or {}); i, cc, q = c.get("i"), c.get("c"), c.get("q")
        # 1 法人
        if i:
            f, t, f5, t5, d5 = i[0], i[1], i[3], i[5], i[7]; tot5 = f5 + t5 + d5
            col = "g" if (tot5 > 0 and f5 > 0 and t5 >= 0) else "r" if (tot5 < 0 and f5 < 0 and t5 <= 0) else "y"
            st = lambda v, n: f"{n}連買 {v} 日" if v > 0 else f"{n}連賣 {-v} 日" if v < 0 else f"{n}今日未買賣"
            txt = f"{st(f, '外資')}、{st(t, '投信')}；外資 5 日 {sg(f5)} 張、投信 5 日 {sg(t5)} 張，三大法人 5 日合計 {sg(tot5)} 張。"
            hint = {"g": "外資與投信近 5 日都沒有在賣，偏多。", "r": "外資與投信近 5 日都在賣，偏空。", "y": "外資與投信方向不一致或不明顯，屬分歧。"}[col]
            lights.append(["inst", "法人動向", col, txt + hint])
        else: lights.append(["inst", "法人動向", "n", "官方資料未提供此股票的法人買賣超。"])
        # 2 融資、3 借券
        mh = sa = 0; rr = rows and len(rows) > 6
        row = cr["data"].get(code)
        L = max((k for k, x in enumerate(row or []) if x and x[0] is not None), default=None)
        if row and L is not None and L >= 5:
            x = row[L]; mb = x[0]; lim = x[2]; use = mb / lim * 100 if lim else None
            m5 = row[L - 5][0] if row[L - 5] and row[L - 5][0] else None
            m5p = (mb - m5) / m5 * 100 if m5 else None
            ret5 = (rows[-1][4] / rows[-6][4] - 1) * 100 if rr else None
            mh = int(bool(m5p is not None and ret5 is not None and use is not None and m5p >= MH_PCT and ret5 >= MH_RET and use >= MH_USE))
            col = "r" if (mh or (use or 0) >= 60) else "y" if ((use or 0) >= 40 or (m5p or 0) >= 5) else "g"
            hint = {"r": "融資使用率高，或融資快速增加且股價上漲（追價偏熱），回檔時容易有斷頭賣壓。", "y": "融資偏高或近 5 日增加較快，留意。", "g": "融資使用率不高、增加不快，籌碼較穩。"}[col]
            sh = x[3]
            lights.append(["margin", "融資", col, f"融資餘額 {mb:,.0f} 張，使用率 {f1(use)}%，5 日增減 {f1(m5p)}%（收盤 5 日 {sg(ret5, 1)}%）；券資比 {f1(sh / mb * 100 if mb else None, 2)}%。" + hint])
            o["mHot"] = mh; nM += mh
            sb = x[5] if len(x) > 5 else None
            sb5 = row[L - 5][5] if row[L - 5] and len(row[L - 5]) > 5 else None
            sb20 = row[L - 20][5] if L >= 20 and row[L - 20] and len(row[L - 20]) > 5 else None
            if sb is not None and sb5 and rr:
                v20 = sum((r[5] or 0) for r in rows[-20:]) / 20 / 1000 if len(rows) >= 20 else None
                p5 = (sb - sb5) / sb5 * 100; inc = sb - sb5
                sa = int(bool(p5 >= SBL_PCT and v20 and inc >= SBL_VOL * v20 and sb20 is not None and sb > sb20))
                col = "r" if sa else "y" if p5 >= 5 else "g"
                hint = {"r": "借券賣出餘額短期明顯累積，是潛在賣壓。", "y": "借券賣出餘額有增加，留意。", "g": "借券賣出餘額沒有明顯累積。"}[col]
                lights.append(["sbl", "借券賣壓", col, f"借券賣出餘額 {sb:,.0f} 張，5 日 {sg(inc)} 張（{sg(p5, 1)}%）" + (f"，約為 20 日均量的 {inc / v20 * 100:.0f}%" if v20 and inc > 0 else "") + "。" + hint])
                o["sblAcc"] = sa; nS += sa
            else: lights.append(["sbl", "借券賣壓", "n", "借券賣出餘額資料不足。"])
        else:
            lights.append(["margin", "融資", "n", "官方資料未提供（非融資融券標的，或當日未列入）。"]); lights.append(["sbl", "借券賣壓", "n", "官方資料未提供。"])
        # 4 大戶（TDCC 每週）
        tr = td["trend"].get(code) or []
        if len(tr) >= 2:
            d = tr[-1][1] - tr[-2][1]; k = tr[-1][2] - tr[-2][2]
            col = "g" if d >= 0.3 else "r" if d <= -0.3 else "y"
            hint = {"g": "大戶持股比上升，籌碼集中。", "r": "大戶持股比下降，籌碼分散。", "y": "大戶持股比變動不大。"}[col]
            lights.append(["big", "大戶持股", col, f"大戶（≥400 張）持股比 {tr[-1][1]:.2f}%，較 {tr[-2][0]} {d:+.2f} 個百分點；千張大戶 {tr[-1][2]:.2f}%（{k:+.2f}）。" + hint])
        elif tr:
            lights.append(["big", "大戶持股", "n", f"大戶持股比 {tr[-1][1]:.2f}%（{tr[-1][0]}）；週變化需兩週資料，官方只提供最新一週，本站每週存檔，下週起顯示。"])
        else: lights.append(["big", "大戶持股", "n", "集保股權分散表未列入此證券。"])
        # 5 外資持股比率
        if q and q[2] is not None:
            col = "g" if q[2] >= 0.3 else "r" if q[2] <= -0.3 else "y"
            hint = {"g": "外資持股比近 20 日上升。", "r": "外資持股比近 20 日下降。", "y": "外資持股比近 20 日變動不大。"}[col]
            lights.append(["qf", "外資持股比", col, f"外資持股比率 {q[0]:.2f}%，5 日 {sg(q[1], 2)}、20 日 {sg(q[2], 2)} 個百分點。" + hint])
        elif q: lights.append(["qf", "外資持股比", "n", f"外資持股比率 {q[0]:.2f}%（歷史累積中，尚無 20 日變化）。"])
        else: lights.append(["qf", "外資持股比", "n", "官方未提供外資持股比率。"])
        o["l"] = lights; items[code] = o
    wjson("chipflags.json", dict(asof=days[-1], tdccWeeks=td.get("weeks"), items=items, updated=now().isoformat(timespec="seconds"),
          th=dict(sblPct=SBL_PCT, sblVol=SBL_VOL, mhPct=MH_PCT, mhRet=MH_RET, mhUse=MH_USE),
          note="燈號：綠＝偏穩／偏多，黃＝留意／分歧，紅＝警示／偏空，灰＝無資料；皆為觀察標示，不是買賣訊號。借券賣壓累積：借券賣出餘額 5 日增 ≥10%、增加量 ≥20 日均量 20%、20 日餘額也增；融資追價過熱：融資 5 日增 ≥8%、收盤 5 日漲 ≥3%、使用率 ≥10%。",
          sources=dict(credit="證交所 MI_MARGN／TWT93U、櫃買中心融資融券與借券賣出餘額", tdcc="集保開放資料 1-5", qfii="證交所 MI_QFIIS、櫃買中心僑外資持股")))
    print("chipflags ok", len(items), "借券賣壓累積", nS, "融資追價過熱", nM)

def levelchips():
    """把借券賣壓累積／融資追價過熱當作第一壓力帶的共振依據（量不是價位，只輔助）：重寫 history/*.json 的 levels.resistance[0]（含其強度）。"""
    import levels as LV
    fl = json.loads((OUT / "chipflags.json").read_text())["items"]; n = 0
    for f in HIS.glob("*.json"):
        try:
            h = json.loads(f.read_text()); o = fl.get(h["code"]); L = h.get("levels")
            if not o or not L or not L.get("resistance"): continue
            if LV.add_chip_basis(L, bool(o.get("sblAcc")), bool(o.get("mHot"))): f.write_text(json.dumps(h, ensure_ascii=False)); n += 1
        except Exception as e: print("levelchips skip", f.name, e)
    print("levelchips ok", n)

DT_DAYS = 20
def _tw_dt(d):
    j = get(f"https://www.twse.com.tw/rwd/zh/dayTrading/TWTB4U?date={d.replace('-', '')}&selectType=All&response=json", tries=2)
    if not j or j.get("stat") != "OK" or len(j.get("tables", [])) < 2: return None
    return {r[0].strip(): int(str(r[3]).replace(",", "") or 0) for r in j["tables"][1]["data"]}
def _tp_dt(d):
    y, m, dd = d.split("-")
    j = get(f"https://www.tpex.org.tw/www/zh-tw/intraday/stat?date={y}/{m}/{dd}&type=Daily&response=json", tries=2)
    if not j or len(j.get("tables", [])) < 2: return None
    return {r[0].strip(): int(str(r[3]).replace(",", "") or 0) for r in j["tables"][1]["data"]}
def daytrade():
    """當沖比＝當日沖銷成交股數 ÷ 當日總成交股數（證交所 TWTB4U、櫃買 intraday/stat 個股當沖成交量；總量取本站逐日行情快照）。近 20 個交易日，逐日快取 snapshots/chips/dt_*。輸出 daytrade.json。"""
    days = [r[0] for r in json.loads((HIS / "2330.json").read_text())["rows"]][-DT_DAYS:]
    st = _stockset(); dtv = {}; vol = {}; got = []
    for d in days:
        ok = False
        for mk, fn in (("上市", _tw_dt), ("上櫃", _tp_dt)):
            v = cached(f"dt_{d}_{mk}.json", lambda: fn(d))
            if v is not None:
                ok = True
                for c, x in v.items(): dtv.setdefault(c, {})[d] = x
            sf = SNAP / f"{d}_{mk}.json"
            if sf.exists():
                for c, v2 in json.loads(sf.read_text()).items(): vol.setdefault(c, {})[d] = (v2[4] if isinstance(v2, list) and len(v2) > 4 else 0)
        if ok: got.append(d)
    if not got: raise RuntimeError("當沖成交量兩來源皆取不到")
    items = {}
    for c in st:
        row = []
        for d in got:
            t = (dtv.get(c) or {}).get(d); v = (vol.get(c) or {}).get(d)
            row.append(None if t is None or not v else round(min(t / v * 100, 100), 1))
        if any(x is not None for x in row): items[c] = row
    wjson("daytrade.json", dict(days=got, items=items, updated=now().isoformat(timespec="seconds"),
          note="當沖比＝個股當日沖銷成交股數 ÷ 該股當日總成交股數；官方當沖統計只列有當沖成交的標的，未列者視為無當沖（不補 0）；總成交股數取本站逐日行情快照。",
          sources=dict(twse="https://www.twse.com.tw/zh/trading/day-trading/twtb4u.html", tpex="https://www.tpex.org.tw/zh-tw/mainboard/trading/intraday/statistics.html")))
    print("daytrade ok", got[0], got[-1], len(got), "stocks", len(items))

# ============ 第三批：大盤、期交所（台指期夜盤日盤、美股／國際指數期貨）、匯率與美債殖利率 ============
def _raw(url, tries=3, enc="utf-8-sig"):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: return r.read().decode(enc, "replace")
        except Exception as e:
            print("retry", url, e); time.sleep(2 * (i + 1))
    return None
def _old(name):
    try: return json.loads((OUT / name).read_text())
    except Exception: return {}
def _iso8(s):   # 20261022 -> 2026-10-22
    s = str(s).strip(); return f"{s[:4]}-{s[4:6]}-{s[6:]}" if len(s) == 8 and s.isdigit() else None

def market():
    """大盤：證交所 FMTQIK（加權指數、成交股數／金額／筆數，近兩個月）＋ 櫃買 tpex_daily_trading_index（櫃買指數與成交量值）＋ 漲跌家數（證交所 MI_INDEX type=MS「漲跌證券數合計」、櫃買 tpex_mainborad_highlight）。漲跌家數每日存入 breadth 累積。輸出 market.json。"""
    meta, _ = _stocks(); old = _old("market.json"); today = now().date()
    tw = {}
    for k in (1, 0):
        y, m = (today.year, today.month - k) if today.month - k >= 1 else (today.year - 1, 12 + today.month - k)
        j = get(f"https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date={y}{m:02d}01&response=json", tries=2); time.sleep(SLEEP)
        for r in (j or {}).get("data", []) if j and j.get("stat") == "OK" else []:
            d = _roc_cn(r[0]) or roc8(r[0].replace("/", ""))
            tw[d] = dict(d=d, close=num(r[4]), chg=num(r[5]), vol=num(r[1]), val=num(r[2]), txn=num(r[3]))
    tp = {}
    j = get("https://www.tpex.org.tw/openapi/v1/tpex_daily_trading_index")
    for r in j or []:
        d = roc8(r["Date"]); tp[d] = dict(d=d, close=num(r["TPExIndex"]), chg=num(r["Change"]), vol=num(r["TradeVolume"]), val=num(r["TradeAmount"]), txn=num(r["NumberOfTransactions"]))
    if not tw and not tp: raise RuntimeError("加權與櫃買大盤資料皆取不到")
    twL = sorted(tw.values(), key=lambda x: x["d"])[-45:]; tpL = sorted(tp.values(), key=lambda x: x["d"])[-45:]
    # 漲跌家數
    br = dict(old.get("breadth") or {})
    td = twL[-1]["d"] if twL else None
    if td:
        j = get(f"https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={td.replace('-', '')}&type=MS&response=json", tries=2); time.sleep(SLEEP)
        t = next((t for t in (j or {}).get("tables", []) if t.get("title") == "漲跌證券數合計"), None)
        if t:
            def pr(x):
                m = re.match(r"\s*([\d,]+)(?:\((\d+)\))?", str(x)); return (int(m[1].replace(",", "")), int(m[2] or 0)) if m else (None, 0)
            rows = {r[0].split("(")[0]: r for r in t["data"]}
            b = dict(d=td, mkt={"up": pr(rows["上漲"][1]), "dn": pr(rows["下跌"][1]), "flat": pr(rows["持平"][1])[0], "none": pr(rows["未成交"][1])[0]},
                     stk={"up": pr(rows["上漲"][2]), "dn": pr(rows["下跌"][2]), "flat": pr(rows["持平"][2])[0], "none": pr(rows["未成交"][2])[0]})
            br.setdefault("twse", {})[td] = b
    j = get("https://www.tpex.org.tw/openapi/v1/tpex_mainborad_highlight")
    if j:
        r = j[-1]; d = roc8(r["Date"])
        br.setdefault("tpex", {})[d] = dict(d=d, up=(int(r["PriceRiseCompanyNumbers"]), int(r["LimitUpCompanyNumbers"])), dn=(int(r["PriceDeclineCompanyNumbers"]), int(r["LimitDownCompanyNumbers"])), flat=int(r["PriceFlatCompanyNumbers"]), none=int(r["UnmatchedCompanyNumbersSuspensionStocksIncluded"]))
    for k in ("twse", "tpex"):
        if k in br: br[k] = dict(sorted(br[k].items())[-60:])
    wjson("market.json", dict(twse=twL, tpex=tpL, breadth=br, asof=dict(twse=twL[-1]["d"] if twL else None, tpex=tpL[-1]["d"] if tpL else None), updated=now().isoformat(timespec="seconds"),
          sources=dict(twse="https://www.twse.com.tw/zh/trading/historical/fmtqik.html；MI_INDEX 大盤統計資訊", tpex="https://www.tpex.org.tw/openapi/v1/tpex_daily_trading_index；tpex_mainborad_highlight"),
          note="加權指數與成交量值取自證交所 FMTQIK（成交值含一般股票、ETF、權證等全部證券）；櫃買指數與成交量值取自櫃買中心；漲跌家數：證交所取「股票」欄（整體市場欄含權證等，一併保存）、櫃買為上櫃公司家數；括號內為漲停／跌停家數。漲跌家數官方只給當日，自本站開始存檔起逐日累積。"))
    print("market ok", twL[-1]["d"] if twL else None, tpL[-1]["d"] if tpL else None, "breadth days", {k: len(v) for k, v in br.items()})

FUT_NAMES = {"TX": "臺股期貨（台指期）", "UDF": "美國道瓊期貨", "SPF": "美國標普500期貨", "UNF": "美國那斯達克100期貨", "SOF": "美國費城半導體期貨", "TJF": "東證期貨（日本）", "GDF": "黃金期貨", "BRF": "布蘭特原油期貨"}
def taifex():
    """期交所 OpenAPI DailyMarketReportFut（期貨每日交易行情；TradingSession 分「一般」＝日盤、「盤後」＝夜盤）。取臺股期貨與期交所掛牌的美股指數期貨（道瓊、標普500、那斯達克100、費半）、東證、黃金、布蘭特原油期貨，近月契約。逐日存檔 snapshots/fut/ 累積走勢。輸出 futures.json。"""
    FD = SNAP / "fut"; FD.mkdir(parents=True, exist_ok=True)
    j = get("https://openapi.taifex.com.tw/v1/DailyMarketReportFut")
    if not j: raise RuntimeError("期貨每日交易行情取不到")
    def f(x): return None if x in (None, "", "-", "NULL") else num(x)
    by = {}
    for r in j:
        c = r["Contract"]
        if c in FUT_NAMES and re.match(r"^\d{6}$", r["ContractMonth(Week)"]): by.setdefault(c, {}).setdefault(r["ContractMonth(Week)"], {})[r["TradingSession"]] = r
    snap = {}
    for c, mm in by.items():
        for mo in sorted(mm):      # 近月：最近且有報價的月份
            ss = mm[mo]
            if any(f(r["Last"]) is not None for r in ss.values()):
                row = {}
                for sess, key in (("一般", "day"), ("盤後", "night")):
                    r = ss.get(sess)
                    if r and f(r["Last"]) is not None:
                        row[key] = dict(d=_iso8(r["Date"]), o=f(r["Open"]), h=f(r["High"]), l=f(r["Low"]), c=f(r["Last"]), chg=f(r["Change"]), pct=num(r["%"]), v=f(r["Volume"]), oi=f(r["OpenInterest"]), st=f(r["SettlementPrice"]))
                snap[c] = dict(m=mo, **row); break
    dates = sorted({v[k]["d"] for v in snap.values() for k in ("day", "night") if k in v})
    if not dates: raise RuntimeError("期貨行情無有效報價")
    latest = dates[-1]
    (FD / f"{latest}.json").write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")))
    for p in sorted(FD.glob("*.json"))[:-60]: p.unlink()
    hist = {}
    for p in sorted(FD.glob("*.json")):
        for c, v in json.loads(p.read_text()).items():
            hist.setdefault(c, []).append([p.stem, (v.get("day") or {}).get("c"), (v.get("night") or {}).get("c"), (v.get("day") or {}).get("pct"), (v.get("night") or {}).get("pct")])
    wjson("futures.json", dict(date=latest, items=snap, names=FUT_NAMES, hist=hist, updated=now().isoformat(timespec="seconds"),
          note="資料取自期交所 OpenAPI DailyMarketReportFut：「日盤」＝一般交易時段（08:45–13:45），「夜盤」＝盤後交易時段（前一日 15:00 至當日 05:00，屬同一交易日）。美股指數期貨為期交所掛牌商品（反映美股盤勢，但成交清淡，價格與美股現貨指數有基差），僅供參考，不是美股收盤指數。期貨每日行情官方只給最新交易日，走勢自本站開始存檔起逐日累積。",
          source="https://openapi.taifex.com.tw/v1/DailyMarketReportFut"))
    print("taifex ok", latest, {c: (v["m"], "day" in v, "night" in v) for c, v in snap.items()})

def macro():
    """匯率與美債殖利率：美元兌新台幣、日圓取自期交所「每日外幣參考匯率」（DailyForeignExchangeRates）；韓元取自中央銀行 BP01D01 日資料（央行資料更新較慢，標註實際日期）；美國公債殖利率取自美國財政部 Daily Treasury Par Yield Curve Rates（XML）。輸出 macro.json。"""
    old = _old("macro.json"); out = dict(old)
    fx = get("https://openapi.taifex.com.tw/v1/DailyForeignExchangeRates")
    if fx:
        rows = sorted(fx, key=lambda r: r["Date"])[-45:]
        out["fx"] = dict(days=[_iso8(r["Date"]) for r in rows], ntd=[num(r["USD/NTD"]) for r in rows], jpy=[num(r["USD/JPY"]) for r in rows], cny=[num(r["USD/RMB"]) for r in rows], eur=[num(r["EUR/USD"]) for r in rows],
                         source="https://openapi.taifex.com.tw/v1/DailyForeignExchangeRates（期交所每日外幣參考匯率）")
    cb = None
    try:
        import ssl
        ctx = ssl.create_default_context(); ctx.verify_flags &= ~getattr(ssl, "VERIFY_X509_STRICT", 0)   # 央行憑證缺 Subject Key Identifier，Python 3.13 嚴格模式會拒絕；仍完整驗證憑證鏈
        with urllib.request.urlopen(urllib.request.Request("https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=BP01D01", headers=UA), timeout=60, context=ctx) as rr: cb = json.loads(rr.read().decode("utf-8-sig"))
    except Exception as e: print("cbc fetch fail", type(e).__name__, e)
    try:
        ds = cb["data"]["dataSets"]; r = ds[-1]
        out["cbc"] = dict(d=_iso8(r[0]), ntd=num(r[1]), jpy=num(r[2]), krw=num(r[5]), cny=num(r[8]), updated=cb["meta"].get("last_updated"),
                          days=[_iso8(x[0]) for x in ds[-30:]], ntdS=[num(x[1]) for x in ds[-30:]], krwS=[num(x[5]) for x in ds[-30:]],
                          source="https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=BP01D01（中央銀行 我國與主要貿易對手通貨對美元之匯率，日資料為台灣 16:00 銀行間即期）")
    except Exception as e: print("cbc fail", type(e).__name__, e)
    ty = {}; tag = lambda k, r: (re.search(rf"<d:{k}[^>]*>([^<]*)</d:{k}>", r) or [None, None])[1]
    for k in (1, 0):
        y, m = (now().year, now().month - k) if now().month - k >= 1 else (now().year - 1, 12 + now().month - k)
        x = _raw(f"https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month={y}{m:02d}", tries=2)
        for r in re.findall(r"<m:properties>(.*?)</m:properties>", x or "", re.S):
            d = (tag("NEW_DATE", r) or "")[:10]
            if d: ty[d] = {k2: num(tag(k2, r)) for k2 in ("BC_3MONTH", "BC_2YEAR", "BC_5YEAR", "BC_10YEAR", "BC_30YEAR")}
    if ty:
        ds = sorted(ty)[-45:]
        out["ust"] = dict(days=ds, y3m=[ty[d]["BC_3MONTH"] for d in ds], y2=[ty[d]["BC_2YEAR"] for d in ds], y5=[ty[d]["BC_5YEAR"] for d in ds], y10=[ty[d]["BC_10YEAR"] for d in ds], y30=[ty[d]["BC_30YEAR"] for d in ds],
                          source="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve（美國財政部 Daily Treasury Par Yield Curve Rates）")
    if not ({"fx", "ust", "cbc"} & set(out) - set(old)) and not (fx or ty): raise RuntimeError("匯率與殖利率來源皆取不到")
    out["updated"] = now().isoformat(timespec="seconds")
    wjson("macro.json", out)
    print("macro ok", "fx", (out.get("fx") or {}).get("days", [None])[-1:], "ust", (out.get("ust") or {}).get("days", [None])[-1:], "cbc", (out.get("cbc") or {}).get("d"))

# ============ 第三批：200 日線（年線）與 52 週高低（由歷史價量計算，不連網；失敗保留前次檔案） ============
def _h52(h):
    """h：history/<代號>.json 內容。回傳要併入的欄位。
    - 疑似未還原事件（gaps.suspect）：只用事件日（含）之後的資料，不跨越跳空（與 MA5/20/60 的處理一致）。
    - MA200：需 ≥ 200 個交易日，不足為 None。
    - 52 週＝最近一個交易日往前 364 天；資料起日晚於視窗起點 + 7 天者視為「歷史不足」(ok52=False)，高低點改標「資料起日以來」。"""
    r = h["rows"]; g = h.get("gaps") or {}
    st = next((i for i in range(len(r)) if r[i][0] == g.get("since")), 0) if g.get("suspect") else 0
    p = r[st:]; n = len(p)
    if not n: return None
    last = p[-1][0]; ws = (dt.date.fromisoformat(last) - dt.timedelta(days=364)).isoformat()
    w = [x for x in p if x[0] >= ws]
    hi = max(w, key=lambda x: x[2]); lo = min(w, key=lambda x: x[3])
    ok = dt.date.fromisoformat(p[0][0]) <= dt.date.fromisoformat(ws) + dt.timedelta(days=7)
    cl = [x[4] for x in p]; c = cl[-1]
    return dict(ma200=round(sum(cl[-200:]) / 200, 2) if n >= 200 else None, n200=n,
                w52=dict(hi=hi[2], hiD=hi[0], lo=lo[3], loD=lo[0], n=len(w), first=p[0][0], ok=ok, since=g.get("since") if g.get("suspect") else None,
                         pos=round((c - lo[3]) / (hi[2] - lo[3]) * 100, 1) if hi[2] > lo[3] else None,
                         dHi=round((c / hi[2] - 1) * 100, 1), dLo=round((c / lo[3] - 1) * 100, 1)))

def hist52():
    n = bad = 0
    for f in sorted(HIS.glob("*.json")):
        try:
            h = json.loads(f.read_text()); u = _h52(h)
            if not u: continue
            h["ma200"] = u["ma200"]; h["n200"] = u["n200"]; h["w52"] = u["w52"]
            f.write_text(json.dumps(h, ensure_ascii=False, separators=(",", ":"))); n += 1
        except Exception as e:
            bad += 1; print("hist52 skip", f.name, type(e).__name__, e)
    print("hist52 ok", n, "skip", bad)

def main(which="all"):
    steps = dict(calendar=calendar, flags=flags, credit=credit, chipsum=chipsum, gaps=gaps, hist52=hist52, events=events, metrics=metrics, fin=fin, dividends=dividends, valhist=valhist, tdcc=tdcc, daytrade=daytrade, chipflags=chipflags, levelchips=levelchips, market=market, taifex=taifex, macro=macro)
    for k, fn in steps.items():
        if which in ("all", k):
            try: fn()
            except Exception as e: print(f"extra.{k} 失敗（保留前次資料）：{type(e).__name__}: {e}")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "all")
