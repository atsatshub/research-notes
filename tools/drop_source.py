"""公開済みの記事から出典を1件削除し、それより後ろの番号を詰める（任意の補助ツール）。

使い方:
    python3 -I tools/drop_source.py articles/記事.html <番号>

先に本文から、その出典を参照している [n] をすべて消しておくこと（残っているとエラーで止まる）。
本文の [n]、出典一覧の id="src-n"、「出典（N件）」の件数をまとめて直す。
"""
import re
import sys

if len(sys.argv) != 3:
    sys.exit(__doc__)

path, n = sys.argv[1], int(sys.argv[2])
s = open(path, encoding="utf-8").read()
if f'href="#src-{n}"' in s:
    sys.exit(f"[{n}] is still cited in the body")
s, k = re.subn(rf'\n\s*<li id="src-{n}">.*?</li>', "", s, count=1)
if k != 1:
    sys.exit("source li not found")


def shift(i):
    return i - 1 if i > n else i


s = re.sub(r'<a class="ref" href="#src-(\d+)">\[\1\]</a>',
           lambda m: f'<a class="ref" href="#src-{shift(int(m.group(1)))}">[{shift(int(m.group(1)))}]</a>', s)
s = re.sub(r'id="src-(\d+)"', lambda m: f'id="src-{shift(int(m.group(1)))}"', s)
s = re.sub(r"<summary>出典（(\d+)件）</summary>", lambda m: f"<summary>出典（{int(m.group(1)) - 1}件）</summary>", s)
open(path, "w", encoding="utf-8").write(s)
print("ok")
