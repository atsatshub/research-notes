"""出典などの外部リンクが開けるかを確かめる（任意の補助ツール）。

使い方（リポジトリのルートで）:
    python3 -I tools/check_links.py                       # 全記事
    python3 -I tools/check_links.py articles/xxx.html     # 指定した記事だけ

- curl を並列で呼び、HTTP 200 以外のリンクだけを表示する。
- 注意: 官公庁・企業のサイトには、自動アクセスにだけ 403 / 404 / 406 を返すところがある
  （例: suntory.co.jp、jal.com、jreast.co.jp、chisou.go.jp、kenpo.gr.jp）。
  200 以外が出たら、すぐ「リンク切れ」と決めつけず、ブラウザ相当の取得（Claude の WebFetch など）で
  ページが本当に無いかを確かめる。ブラウザのふりをするヘッダーを付けて回避することはしない。
"""
import glob
import html
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

files = sys.argv[1:] or sorted(glob.glob("articles/*.html")) + ["index.html", "about.html"]
urls = set()
for f in files:
    s = open(f, encoding="utf-8").read()
    urls |= {html.unescape(u) for u in re.findall(r'href="(https?://[^"]+)"', s)}
urls = sorted(u for u in urls if "atsatshub.github.io" not in u)


def status(u):
    for _ in range(2):  # 一時的な接続エラーに備えて1回だけ再試行
        r = subprocess.run(["curl", "-s", "-o", "/dev/null", "-m", "45", "-L", "-w", "%{http_code}", u],
                           capture_output=True, text=True)
        code = r.stdout.strip() or "000"
        if code == "200":
            break
    return code, u


bad = 0
with ThreadPoolExecutor(max_workers=12) as ex:
    for code, u in ex.map(status, urls):
        if code != "200":
            bad += 1
            print(code, u)
print(f"{len(urls)} 件中 {bad} 件が 200 以外" if bad else f"{len(urls)} 件すべて 200")
