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
    ex = {}
    for d in dates:
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

def main(which="all"):
    steps = dict(calendar=calendar, flags=flags, credit=credit, chipsum=chipsum, gaps=gaps)
    for k, fn in steps.items():
        if which in ("all", k):
            try: fn()
            except Exception as e: print(f"extra.{k} 失敗（保留前次資料）：{type(e).__name__}: {e}")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "all")
