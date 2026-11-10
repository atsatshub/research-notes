"""記事の下書きから、出典の番号を自動で振った完成版 HTML を作る（任意の補助ツール）。

使い方:
    python3 -I tools/build_article.py <article_src.html> <sources.py> <articles/出力.html>

- article_src.html: template.html をもとに書いた下書き。出典を参照したい場所に [[key]] と書き、
  出典一覧を置く場所に <!-- SOURCES --> と書く。
- sources.py: 次の2つを定義する Python ファイル。
      VIEWED = "2026年11月3日"                     # 閲覧日（出典一覧の冒頭に出る）
      SOURCES = {"key": ("発行元", "ページ名", "URL"), ...}
- 本文で最初に出てきた順に [1], [2], ... と番号を振り、末尾に折りたたみ式の出典一覧を作る。
- 定義していない key を使った場合と、定義したのに使っていない出典がある場合はエラーで止まる。
- 最後に tools/update_pages.py と同じ処理をして、「本文へ移動」のリンク、パンくずのカテゴリへのリンク、
  構造化データ（JSON-LD）を入れる。

公開済みの記事を直すときは、完成版の HTML を直接編集してよい
（出典を1件消すときは tools/drop_source.py で番号を詰める）。
"""
import re
import sys
from pathlib import Path

# -I（隔離モード）ではこのフォルダが検索先に入らないので、自分で足してから読み込む
sys.path.insert(0, str(Path(__file__).resolve().parent))
import update_pages  # noqa: E402

if len(sys.argv) != 4:
    sys.exit(__doc__)

src, srcs, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
ns = {}
exec(srcs.read_text(encoding="utf-8"), ns)
SOURCES, VIEWED = ns["SOURCES"], ns["VIEWED"]
html = src.read_text(encoding="utf-8")
order = []


def ref(m):
    k = m.group(1)
    if k not in SOURCES:
        sys.exit("unknown source key: " + k)
    if k not in order:
        order.append(k)
    n = order.index(k) + 1
    return f'<a class="ref" href="#src-{n}">[{n}]</a>'


html = re.sub(r"\[\[([\w-]+)\]\]", ref, html)
unused = sorted(set(SOURCES) - set(order))
if unused:
    sys.exit(f"unused sources: {unused}")
lines = ['<details class="sources-box" id="sources">',
         f'        <summary>出典（{len(order)}件）</summary>',
         f'        <p class="sources-note">閲覧日はいずれも{VIEWED}</p>',
         '        <ol class="sources">']
for n, k in enumerate(order, 1):
    pub, page, url = SOURCES[k]
    lines.append(f'          <li id="src-{n}"><a href="{url}" target="_blank" rel="noopener">{page}</a>（{pub}）</li>')
lines += ["        </ol>", "      </details>"]
html = html.replace("<!-- SOURCES -->", "\n".join(lines))
if "[[" in html:
    sys.exit("unresolved marker left")
html = update_pages.apply("articles/" + out.name, html)
out.write_text(html, encoding="utf-8")
print("ok", len(order), "sources ->", out)
