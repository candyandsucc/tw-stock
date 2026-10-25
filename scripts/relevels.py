#!/usr/bin/env python3
"""離線重算 site/data/history/*.json 內的 levels（不連網，只用檔內 rows）。levels.py 演算法更新後執行一次即可；每日更新由 fetch.py 直接用新演算法。"""
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import levels
def main():
    n = 0
    for f in sorted((ROOT / "site" / "data" / "history").glob("*.json")):
        try:
            h = json.loads(f.read_text(encoding="utf-8")); r = h["rows"]
            if len(r) < 10: continue
            h["levels"] = levels.compute(r, r[-1][4]); h["method"] = "結構法 v2"
            f.write_text(json.dumps(h, ensure_ascii=False)); n += 1
        except Exception as e: print("skip", f.name, e)
    print("relevels ok", n)
if __name__ == "__main__": main()
