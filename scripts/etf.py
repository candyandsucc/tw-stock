"""ETF 持股抓取：只用各投信官網公開的持股／PCF／資產明細（不用第三方彙整站、不繞過驗證）。
每檔獨立 try，單檔失敗只記錄原因、不中斷、不讓整個 workflow 失敗。
失敗時若有歷史快照，沿用最近一次成功資料並明確標示「沿用舊資料」與其基準日；沒有快照就顯示取得失敗原因，不補假資料。
輸出 site/data/etf.json；每次成功的資料存 snapshots/etf/{代號}_{基準日}.json 供之後比對增減。"""
import json, re, time, html as H, subprocess, pathlib, zipfile, datetime as dt, tempfile, os
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data"; SNAP = ROOT / "snapshots" / "etf"; SNAP.mkdir(parents=True, exist_ok=True)
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
SLEEP = 1.0

class EtfError(Exception): pass

def curl(url, data=None, json_body=None, jar=None, tries=3, binary=False, timeout=60):
    """用 curl 取檔（部分投信站對 urllib 會卡住）。回傳 bytes；失敗丟 EtfError(原因)。"""
    last = "未知錯誤"
    for i in range(tries):
        cmd = ["curl", "-sS", "-L", "--max-time", str(timeout), "-A", UA, "-w", "\n%{http_code}", url]
        if jar: cmd[1:1] = ["-c", jar, "-b", jar]
        if json_body is not None: cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(json_body)]
        elif data is not None: cmd += ["--data-binary", "@-"]
        try:
            p = subprocess.run(cmd, capture_output=True, input=data if isinstance(data, bytes) else (data.encode() if data else None), timeout=timeout + 15)
        except subprocess.TimeoutExpired: last = "連線逾時"; time.sleep(3 * (i + 1)); continue
        body, _, code = p.stdout.rpartition(b"\n")
        code = code.decode(errors="ignore").strip()
        if p.returncode != 0: last = f"連線失敗（curl {p.returncode}：{p.stderr.decode(errors='ignore').strip()[:80]}）"
        elif code != "200": last = f"HTTP {code}" + ("（疑似被來源拒絕存取）" if code in ("403", "429", "503", "525") else "")
        elif len(body) < 200 and not binary: last = "回應內容為空"
        else: return body
        time.sleep(3 * (i + 1))
    raise EtfError(last)

def ndate(s):
    s = str(s).strip().replace("/", "-")
    m = re.match(r"(\d{4})-?(\d{2})-?(\d{2})", s)
    if m: return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r"(\d{2,3})-(\d{2})-(\d{2})", s)  # 民國
    if m: return f"{int(m.group(1)) + 1911}-{m.group(2)}-{m.group(3)}"
    raise EtfError(f"無法判讀日期：{s}")

def n(s):
    try: return float(str(s).replace(",", "").replace("%", "").strip())
    except ValueError: return None

def hold(code, name, shares, weight): return dict(code=str(code).strip(), name=str(name).strip(), shares=shares, weight=weight)

def twstock(h): return re.fullmatch(r"\d{4}", h["code"]) is not None  # 只收台股 4 碼普通股（過濾期貨、現金、外國股）

# ---------- xlsx 極簡讀取（不需第三方套件） ----------
def xlsx_rows(b):
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f: f.write(b); fn = f.name
    try:
        z = zipfile.ZipFile(fn)
        ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        ss = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns): ss.append("".join(t.text or "" for t in si.iter("{%s}t" % ns["m"])))
        sheet = sorted(x for x in z.namelist() if x.startswith("xl/worksheets/sheet"))[0]
        rows = []
        for r in ET.fromstring(z.read(sheet)).iter("{%s}row" % ns["m"]):
            row = {}
            for c in r.findall("m:c", ns):
                col = re.match(r"[A-Z]+", c.get("r")).group(0); t = c.get("t"); v = c.find("m:v", ns)
                if t == "s" and v is not None: val = ss[int(v.text)]
                elif t == "inlineStr": val = "".join(x.text or "" for x in c.iter("{%s}t" % ns["m"]))
                else: val = v.text if v is not None else None
                row[col] = val
            rows.append([row.get(k) for k in "ABCDEFGH"])
        return rows
    finally: os.unlink(fn)

# ---------- 各投信 ----------
def yuanta(code, date=None):
    b = curl(f"https://www.yuantaetfs.com/product/detail/{code}/ratio", tries=4, timeout=60, binary=True)
    if len(b) < 20000: raise EtfError(f"元大頁面內容異常（{len(b)} bytes，可能被擋或改版）")
    p = subprocess.run(["node", str(ROOT / "scripts" / "yuanta_parse.js")], input=b, capture_output=True, timeout=60)
    try: j = json.loads(p.stdout)
    except Exception: raise EtfError("元大頁面解析失敗（node 執行錯誤）")
    if j.get("error"): raise EtfError(f"元大頁面改版：{j['error']}")
    hs = [hold(x["code"], x["name"], x["shares"], x["weight"]) for x in j["holdings"]]
    return dict(date=j["date"], holdings=[h for h in hs if twstock(h)])

def capital(fid, date=None):
    j = json.loads(curl("https://www.capitalfund.com.tw/CFWeb/api/etf/buyback", json_body={"fundId": fid, "date": date}))
    if j.get("code") != 200: raise EtfError(f"群益 API 回應 code={j.get('code')}")
    d = j["data"]
    hs = [hold(s["stocNo"], s["stocName"], s["share"], s["weight"]) for s in d.get("stocks", [])]
    return dict(date=d["pcf"]["date2"], holdings=[h for h in hs if twstock(h)])  # PCF 依前一營業日收盤持股編製，以 date2 為基準日

def fuhhwa(eid, date):
    d = date.replace("-", "")
    b = curl(f"https://www.fhtrust.com.tw/api/assetsExcel/{eid}/{d}", binary=True)
    if len(b) < 500: raise EtfError("復華當日無資料")
    rows = xlsx_rows(b); hs = []
    dd = next((ndate(re.search(r"\d{4}/\d{2}/\d{2}", str(r[0])).group(0)) for r in rows if r[0] and "日期" in str(r[0]) and re.search(r"\d{4}/\d{2}/\d{2}", str(r[0]))), None)
    if dd != date: raise EtfError(f"復華檔案日期 {dd} 與要求 {date} 不符")
    on = False
    for r in rows:
        if r[0] == "證券代號": on = True; continue
        if on and r[0] and re.fullmatch(r"\d{4}", str(r[0]).strip()): hs.append(hold(r[0], r[1], n(r[2]), n(r[4])))
    if not hs: raise EtfError("復華檔案找不到持股列（改版？）")
    return dict(date=dd, holdings=hs)

def nomura(code, date):
    j = json.loads(curl("https://www.nomurafunds.com.tw/API/ETFAPI/api/Fund/GetFundAssets", json_body={"FundID": code, "SearchDate": date}))
    e = (j or {}).get("Entries")
    if not e or not e.get("Data"): raise EtfError("野村當日無資料")
    fa = e["Data"]["FundAsset"]
    if ndate(fa["NavDate"]) != date: raise EtfError(f"野村資料日 {fa['NavDate']} 與要求 {date} 不符")
    t = next((t for t in e["Data"]["Table"] if t["TableTitle"] == "股票"), None)
    if not t: raise EtfError("野村回應找不到股票表（改版？）")
    return dict(date=date, holdings=[h for h in (hold(r[0], r[1], n(r[2]), n(r[3])) for r in t["Rows"]) if twstock(h)])

def ezmoney(fund, date=None):
    jar = tempfile.mktemp()
    try:
        t = curl(f"https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode={fund}", jar=jar, binary=True).decode("utf-8", "ignore")
    finally:
        if os.path.exists(jar): os.unlink(jar)
    m = re.search(r'id="DataAsset" data-content="([^"]*)"', t)
    if not m: raise EtfError("統一投信頁面改版：找不到資產資料")
    a = json.loads(H.unescape(m.group(1)))
    st = next((x for x in a if x["AssetCode"] == "ST"), None)
    if not st or not st.get("Details"): raise EtfError("統一投信頁面無股票明細")
    d = ndate(st["Details"][0]["TranDate"])
    return dict(date=d, holdings=[hold(x["DetailCode"], x["DetailName"], x["Share"], x["NavRate"]) for x in st["Details"] if re.fullmatch(r"\d{4}", str(x["DetailCode"]).strip())])

def fubon(stk, date=None):
    u = f"https://websys.fsit.com.tw/FubonETF/Trade/Assets.aspx?stkId={stk}" + (f"&ddate={date.replace('-', '')}&lan=TW" if date else "")
    jar = tempfile.mktemp()
    try: t = curl(u, jar=jar, binary=True).decode("utf-8", "ignore")
    finally:
        if os.path.exists(jar): os.unlink(jar)
    m = re.search(r"資料日期：\s*(\d{4}/\d{2}/\d{2})", t)
    if not m: raise EtfError("富邦頁面改版：找不到資料日期")
    d = ndate(m.group(1))
    if date and d != date: raise EtfError(f"富邦資料日 {d} 與要求 {date} 不符")
    i = t.find("<h6 class=\"mb20\">股票</h6>")
    if i < 0: raise EtfError("富邦頁面改版：找不到股票表")
    hs = []
    for r in re.finditer(r'<tr>\s*<td class="tac">(\d{4})</td>\s*<td>([^<]*)</td>\s*<td class="tar">([\d,]+)</td>\s*<td class="tar">[\d,]+</td>\s*<td class="tar">([\d.]+)</td>', t[i:]):
        hs.append(hold(r.group(1), H.unescape(r.group(2)), n(r.group(3)), n(r.group(4))))
    if not hs: raise EtfError("富邦頁面無持股列")
    return dict(date=d, holdings=hs)

CATH = "https://cwapi.cathaysite.com.tw/api/ETF/DownloadETFWeightExcel?FundCode={f}&SearchDate={d}"
def cathay(fund, date):
    b = curl(CATH.format(f=fund, d=date.replace("-", "/")), binary=True, tries=2)
    rows = xlsx_rows(b); hs = []
    for r in rows:
        if r[0] and re.fullmatch(r"\d{4}", str(r[0]).strip()): hs.append(hold(r[0], r[1], n(r[2]), n(r[3])))
    if not hs: raise EtfError("國泰檔案找不到持股列")
    return dict(date=date, holdings=hs)

# (代號, 名稱, 投信, 官方頁面, 取得函式, 參數, 可依日期回查前期)
FUNDS = [
    ("0050", "元大台灣50", "元大投信", "https://www.yuantaetfs.com/product/detail/0050/ratio", yuanta, "0050", False),
    ("0051", "元大中型100", "元大投信", "https://www.yuantaetfs.com/product/detail/0051/ratio", yuanta, "0051", False),
    ("0053", "元大電子", "元大投信", "https://www.yuantaetfs.com/product/detail/0053/ratio", yuanta, "0053", False),
    ("0055", "元大MSCI金融", "元大投信", "https://www.yuantaetfs.com/product/detail/0055/ratio", yuanta, "0055", False),
    ("0056", "元大高股息", "元大投信", "https://www.yuantaetfs.com/product/detail/0056/ratio", yuanta, "0056", False),
    ("006203", "元大MSCI台灣", "元大投信", "https://www.yuantaetfs.com/product/detail/006203/ratio", yuanta, "006203", False),
    ("00713", "元大台灣高息低波", "元大投信", "https://www.yuantaetfs.com/product/detail/00713/ratio", yuanta, "00713", False),
    ("00850", "元大臺灣ESG永續", "元大投信", "https://www.yuantaetfs.com/product/detail/00850/ratio", yuanta, "00850", False),
    ("00940", "元大台灣價值高息", "元大投信", "https://www.yuantaetfs.com/product/detail/00940/ratio", yuanta, "00940", False),
    ("00919", "群益台灣精選高息", "群益投信", "https://www.capitalfund.com.tw/etf/product/detail/195/portfolio", capital, "195", True),
    ("00982A", "主動群益台灣強棒", "群益投信", "https://www.capitalfund.com.tw/etf/product/detail/399/portfolio", capital, "399", True),
    ("00929", "復華台灣科技優息", "復華投信", "https://www.fhtrust.com.tw/ETF/etf_detail/ETF21", fuhhwa, "ETF21", True),
    ("00991A", "主動復華台灣未來50", "復華投信", "https://www.fhtrust.com.tw/ETF/etf_detail/ETF23", fuhhwa, "ETF23", True),
    ("00731", "復華富時台灣高股息低波動", "復華投信", "https://www.fhtrust.com.tw/ETF/etf_detail/ETF08", fuhhwa, "ETF08", True),
    ("00980A", "主動野村臺灣優選", "野村投信", "https://www.nomurafunds.com.tw/ETFWEB/product-description?fundNo=00980A&tab=Shareholding", nomura, "00980A", True),
    ("00985A", "主動野村台灣50", "野村投信", "https://www.nomurafunds.com.tw/ETFWEB/product-description?fundNo=00985A&tab=Shareholding", nomura, "00985A", True),
    ("00935", "野村臺灣新科技50", "野村投信", "https://www.nomurafunds.com.tw/ETFWEB/product-description?fundNo=00935&tab=Shareholding", nomura, "00935", True),
    ("00981A", "主動統一台股增長", "統一投信", "https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode=49YTW", ezmoney, "49YTW", False),
    ("00403A", "主動統一升級50", "統一投信", "https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode=63YTW", ezmoney, "63YTW", False),
    ("00939", "統一台灣高息動能", "統一投信", "https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode=46YTW", ezmoney, "46YTW", False),
    ("006208", "富邦台50", "富邦投信", "https://websys.fsit.com.tw/FubonETF/Trade/Assets.aspx?stkId=006208", fubon, "006208", True),
    ("00900", "富邦特選高股息30", "富邦投信", "https://websys.fsit.com.tw/FubonETF/Trade/Assets.aspx?stkId=00900", fubon, "00900", True),
    ("00692", "富邦公司治理", "富邦投信", "https://websys.fsit.com.tw/FubonETF/Trade/Assets.aspx?stkId=00692", fubon, "00692", True),
    ("00878", "國泰永續高股息", "國泰投信", "https://www.cathaysite.com.tw/ETF/detail/ECN", cathay, "CN", True),
]
# 尚未納入（原因）：中信、永豐——官網為前端渲染且找不到穩定的公開下載介面；國泰官網與其 API 對自動化請求回 403（Akamai 存取拒絕），
# 若排程環境可連線則自動取得，否則在頁面顯示失敗原因。不繞過任何存取限制。
NOT_COVERED = "中信投信、永豐投信（官網為前端渲染且無穩定公開下載介面）；其他未列出的 ETF"

def snaps(code): return sorted(SNAP.glob(f"{code}_*.json"), key=lambda f: f.name)
def save(code, cur):
    (SNAP / f"{code}_{cur['date']}.json").write_text(json.dumps(cur, ensure_ascii=False, separators=(",", ":")))
    for f in snaps(code)[:-4]: f.unlink()

def prev_days(d, k=7):
    x = dt.date.fromisoformat(d)
    for i in range(1, k + 1):
        y = x - dt.timedelta(days=i)
        if y.weekday() < 5: yield y.isoformat()

def fetch_one(code, fn, arg, canhist, latest):
    """回傳 (cur, prev, status, reason, stale)。"""
    cur = None; reason = None
    try:
        if fn in (fuhhwa, nomura, cathay):  # 依日期查：自最近交易日往前找第一個有資料的日期
            last = None
            for d in [latest] + list(prev_days(latest, 4)):
                try: cur = fn(arg, d); break
                except EtfError as e:
                    last = e; time.sleep(0.5)
                    if str(e).startswith(("HTTP", "連線")): break  # 來源拒絕／連線問題：換日期也沒用，不重複打
            if cur is None: raise EtfError(str(last) if str(last).startswith(("HTTP", "連線")) else f"{latest} 起往前 5 個營業日皆無資料（{last}）")
        else: cur = fn(arg)
        if not cur["holdings"]: raise EtfError("解析後沒有任何台股持股")
    except EtfError as e: reason = str(e)
    except Exception as e: reason = f"程式例外：{type(e).__name__}: {e}"
    stale = False
    if cur:
        save(code, cur)
        olds = [json.loads(f.read_text()) for f in snaps(code) if f.name[len(code) + 1:-5] < cur["date"]]
        prev = olds[-1] if olds else None
        if not prev and canhist:
            try:
                time.sleep(SLEEP)
                if fn is capital: prev = capital(arg, cur["date"])
                else:
                    for d in prev_days(cur["date"], 5):
                        try: prev = fn(arg, d); break
                        except EtfError: pass
                if prev: save(code, prev)
            except Exception as e: print("prev fail", code, e)
        return cur, prev, True, None, False
    # 失敗：沿用最近一次成功快照（標示舊基準日）
    s = snaps(code)
    if s:
        cur = json.loads(s[-1].read_text())
        olds = [json.loads(f.read_text()) for f in s[:-1]]
        return cur, (olds[-1] if olds else None), False, reason, True
    return None, None, False, reason, False

def main():
    S = json.loads((OUT / "stocks.json").read_text())
    latest = S["meta"].get("twseDate") or dt.date.today().isoformat()
    funds = []
    for code, name, issuer, url, fn, arg, canhist in FUNDS:
        try: cur, prev, ok, reason, stale = fetch_one(code, fn, arg, canhist, latest)
        except Exception as e: cur = prev = None; ok = False; stale = False; reason = f"程式例外：{type(e).__name__}: {e}"
        print("ETF", code, "OK" if ok else ("STALE " if stale else "FAIL "), cur and cur["date"], reason or "", flush=True)
        funds.append(dict(code=code, name=name, issuer=issuer, url=url, cur=cur, prev=prev, ok=ok, stale=stale, reason=reason))
        time.sleep(SLEEP)
    # 第二輪：本輪失敗者（多半是來源暫時性錯誤）隔一段時間再試一次
    bad = [i for i, f in enumerate(funds) if not f["ok"]]
    if bad:
        time.sleep(30)
        for i in bad:
            code, name, issuer, url, fn, arg, canhist = FUNDS[i]
            try: cur, prev, ok, reason, stale = fetch_one(code, fn, arg, canhist, latest)
            except Exception as e: continue
            print("ETF(第二輪)", code, "OK" if ok else "仍失敗", cur and cur["date"], reason or "", flush=True)
            if ok: funds[i] = dict(code=code, name=name, issuer=issuer, url=url, cur=cur, prev=prev, ok=ok, stale=stale, reason=reason)
            time.sleep(SLEEP)
    hold_ = {}
    for f in funds:
        if not f["cur"]: continue
        cm = {h["code"]: h for h in f["cur"]["holdings"]}; pm = {h["code"]: h for h in f["prev"]["holdings"]} if f["prev"] else None
        for c in set(cm) | set(pm or {}):
            r, p = cm.get(c), (pm or {}).get(c)
            hold_.setdefault(c, []).append(dict(fund=f["code"], shares=r["shares"] if r else 0, weight=r["weight"] if r else 0,
                prevShares=(p["shares"] if p else 0) if pm is not None else None, prevWeight=(p["weight"] if p else 0) if pm is not None else None))
    etf = dict(updated=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec="seconds"), notCovered=NOT_COVERED,
        funds=[dict(code=f["code"], name=f["name"], issuer=f["issuer"], url=f["url"], ok=f["ok"], stale=f["stale"], reason=f["reason"],
                    date=f["cur"]["date"] if f["cur"] else None, prevDate=f["prev"]["date"] if f["prev"] else None,
                    n=len(f["cur"]["holdings"]) if f["cur"] else 0) for f in funds], holdings=hold_)
    (OUT / "etf.json").write_text(json.dumps(etf, ensure_ascii=False, separators=(",", ":")))
    okn = sum(f["ok"] for f in funds); stn = sum(f["stale"] for f in funds)
    print(f"etf done：成功 {okn} / 沿用舊資料 {stn} / 失敗 {len(funds) - okn - stn}，共 {len(funds)} 檔")

if __name__ == "__main__":
    try: main()
    except Exception as e: print("etf 整體失敗（保留前次 etf.json）:", e)
