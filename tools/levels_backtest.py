"""用法：python3 tools/levels_backtest.py '{}' 3（參數 JSON、取樣間隔）。tools/levels_v1.py 為舊版固定 1.6% 合併演算法，僅供前後比較。
守住率／壓力有效率回測：以歷史每 3 個交易日為基準日，只用基準日當天以前的資料算價位，之後 10 個交易日內檢驗。
支撐：10 日內觸及（最低 ≤ 帶上緣）→ 觸及後連 3 根收盤皆未低於帶下緣 ×0.99 視為守住。
壓力：10 日內觸及（最高 ≥ 帶下緣）→ 觸及後連 3 根收盤皆未高於帶上緣 ×1.01 視為有效（受阻）。"""
import sys,json,glob,random,importlib
from multiprocessing import Pool
import pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'scripts')); sys.path.insert(0,str(ROOT/'tools'))
import levels as L2, levels_v1 as L1
FILES=sorted(glob.glob(str(ROOT/'site/data/history/*.json')))
def ev(rows,t,side,low,high,h=10):
    fut=rows[t+1:t+1+h]
    for j,r in enumerate(fut):
        if side=='S' and r[3]<=high or side=='R' and r[2]>=low:
            seg=fut[j:j+3]
            if len(seg)<3: return None
            if side=='S': return 1 if all(x[4]>=low*0.99 for x in seg) else 0
            return 1 if all(x[4]<=high*1.01 for x in seg) else 0
    return -1  # 未觸及
def one(args):
    f,params,step=args
    d=json.load(open(f)); rows=d['rows']
    if len(rows)<200: return []
    out=[]
    for t in range(120,len(rows)-14,step):
        h=rows[:t+1]; c=h[-1][4]
        for ver,mod in (('v1',L1),('v2',L2)):
            if ver=='v1': Lv=mod.compute(h,c)
            else: Lv=mod.compute(h,c,params=params)
            if not Lv.get('support') and not Lv.get('resistance'): continue
            for side,key in (('S','support'),('R','resistance')):
                for rank,b in enumerate(Lv[key][:2]):
                    k=b.get('n',1); st=b.get('strength')
                    r=ev(rows,t,side,b['low'],b['high'])
                    if r is None: continue
                    w=b['high']-b['low']; dist=abs(b['price']/c-1)
                    nulls=[]
                    for u in (0.6,1.5):
                        px=c*(1-dist*u) if side=='S' else c*(1+dist*u)
                        lo=px-w if side=='S' else px; hi=px if side=='S' else px+w
                        nulls.append(ev(rows,t,side,lo,hi))
                    out.append((ver,side,rank,k,st,r,nulls,round(dist*100,2)))
    return out
def agg(rs,label):
    tot={}
    for ver,side,rank,k,st,r,nulls,dist in rs:
        key=(ver,side,rank)
        a=tot.setdefault(key,[0,0,0,0,0,0])
        a[0]+=1
        if r>=0: a[1]+=1; a[2]+=r
        for nn in nulls:
            if nn is not None and nn>=0: a[3]+=1; a[4]+=nn
    return tot
if __name__=='__main__':
    params=json.loads(sys.argv[1]) if len(sys.argv)>1 else {}
    step=int(sys.argv[2]) if len(sys.argv)>2 else 3
    with Pool(8) as p: res=p.map(one,[(f,params,step) for f in FILES],chunksize=4)
    rs=[x for r in res for x in r]
    json.dump(rs,open('/tmp/levels_bt_last.json','w'))
    tot=agg(rs,'')
    for key in sorted(tot):
        n,tc,h,nt,nh,_=tot[key]
        print(key,f"樣本{n} 觸及率{tc/n*100:.0f}% 守住/有效率{h/tc*100 if tc else 0:.1f}%（觸及{tc}） | 對照帶 觸及{nt} 守住率{nh/nt*100 if nt else 0:.1f}%")
    # by strength for v2
    by={}
    for ver,side,rank,k,st,r,nulls,dist in rs:
        if ver!='v2' or r<0: continue
        a=by.setdefault((side,k if k<4 else 4),[0,0]); a[0]+=1; a[1]+=r
    for k in sorted(by): print('v2 依據數',k,f"觸及{by[k][0]} 守住/有效{by[k][1]/by[k][0]*100:.1f}%")
    by={}
    for ver,side,rank,k,st,r,nulls,dist in rs:
        if ver!='v1' or r<0: continue
        a=by.setdefault((side,k if k<4 else 4),[0,0]); a[0]+=1; a[1]+=r
    for k in sorted(by): print('v1 依據數',k,f"觸及{by[k][0]} 守住/有效{by[k][1]/by[k][0]*100:.1f}%")
