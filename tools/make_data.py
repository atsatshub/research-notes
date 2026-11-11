"""検索用のデータ・関連する記事・RSS を作る（任意の補助ツール）。

使い方（リポジトリのルートで）:
    python3 -I tools/make_data.py           # 作り直す（中身が同じなら書き換えない）
    python3 -I tools/make_data.py --check   # 古くなっていないかだけ確かめる

index.html の記事カードと articles/*.html の本文から、次の3つを作る。
1. assets/search-index.json
   トップページの検索が、記事の中の見出し・要点まとめ・ひとこと・表の見出しまで探せるようにするデータ。
   検索欄を使うときだけ assets/site.js が読み込む。
2. assets/related.json
   記事の最後に出す「関連する記事」。本文に出てくる言葉の近さで、記事ごとに4件を選ぶ。
3. feed.xml
   新着記事の RSS（新しく追加した順に30件）。

何度実行しても同じ結果になる。tools/update_pages.py（全ページを対象にしたとき）が最後に呼ぶので、
ふだんは update_pages.py を実行すればよい。古いままのときは tools/check_site.py が知らせる。
"""
import html
import json
import math
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime

# -I（隔離モード）ではこのフォルダが検索先に入らないので、自分で足してから読み込む
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import update_pages  # noqa: E402

BASE = update_pages.BASE
SITE = update_pages.SITE
SEARCH_PATH = "assets/search-index.json"
RELATED_PATH = "assets/related.json"
FEED_PATH = "feed.xml"
RELATED_COUNT = 4  # 記事ごとに選ぶ関連記事の数
SAME_CATEGORY_BONUS = 0.03  # 同じカテゴリの記事を少しだけ優先する
FEED_COUNT = 30  # RSS に載せる件数


def lp(path):
    """Windows で 260 文字を超えるパスも読めるようにする（作業フォルダが深いときのため）"""
    if os.name == "nt":
        return "\\\\?\\" + os.path.abspath(path)
    return path


def plain(fragment, sep=" "):
    """タグと出典番号 [n] を除いた文字列。空白は1つにまとめる"""
    fragment = re.sub(r'<a class="ref"[^>]*>.*?</a>', "", fragment, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", sep, fragment))).strip()


def read_index():
    """index.html の記事カードを、書いてある順に返す"""
    with open("index.html", encoding="utf-8") as f:
        s = re.sub(r"<!--.*?-->", "", f.read(), flags=re.S)
    pat = re.compile(
        r'<h3 class="article-group-title"[^>]*>(.*?)</h3>'
        r'|<li data-seq="(\d+)">\s*<a class="article-card" href="articles/([a-z0-9-]+)\.html">(.*?)</a>', re.S)
    arts, cat = [], ""
    for m in pat.finditer(s):
        if m.group(1) is not None:
            cat = re.sub(r"（.*?）", "", plain(m.group(1), "")).strip()
            continue
        card = m.group(4)
        arts.append({
            "name": m.group(3),
            "seq": int(m.group(2)),
            "cat": cat,
            "title": plain(re.search(r'<span class="article-card-title">(.*?)</span>', card, re.S).group(1), ""),
            "desc": plain(re.search(r'<span class="article-card-desc">(.*?)</span>', card, re.S).group(1), ""),
            "date": re.search(r'<time datetime="(\d{4}-\d\d-\d\d)">', card).group(1),
        })
    return arts


def read_article(name):
    """記事の本文（出典・目次・免責・図の中の文字を除く）を、検索と関連記事の計算用に読む"""
    with open(lp(f"articles/{name}.html"), encoding="utf-8") as f:
        s = f.read()
    body = re.search(r"<article\b[^>]*>(.*?)</article>", s, re.S).group(1)
    body = re.sub(r'<details class="sources-box".*?</details>', "", body, flags=re.S)
    body = re.sub(r"<svg\b.*?</svg>", "", body, flags=re.S)
    body = re.sub(r'<a class="ref"[^>]*>.*?</a>', "", body, flags=re.S)
    summary = re.search(r'<section class="summary".*?</section>', body, re.S)
    points = [plain(x) for x in re.findall(r"<li>(.*?)</li>", summary.group(0), re.S)] if summary else []
    body = re.sub(r"<(nav|aside)\b.*?</\1>", "", body, flags=re.S)
    sections = []
    for part in re.split(r'(?=<h2 id="sec-\d+")', body)[1:]:
        m = re.match(r'<h2 id="(sec-\d+)"[^>]*>(.*?)</h2>', part, re.S)
        heads = [plain(x, "") for x in re.findall(r"<h3[^>]*>(.*?)</h3>", part, re.S)]
        extra = []
        for pat in (r'<p class="item-point">(.*?)</p>', r"<caption>(.*?)</caption>", r"<th[^>]*>(.*?)</th>", r"<dt[^>]*>(.*?)</dt>"):
            extra += [plain(x) for x in re.findall(pat, part, re.S)]
        extra = [x for x in dict.fromkeys(extra) if x]  # 同じ言葉（表の見出しなど）は1回だけ
        sections.append([m.group(1), plain(m.group(2), ""), heads, " ".join(extra)])
    headings = [plain(x, "") for x in re.findall(r"<h[123][^>]*>(.*?)</h[123]>", body, re.S)]
    return {"points": points, "sections": sections, "text": plain(body), "headings": headings}


def dump_lines(data):
    """1記事1行の JSON にする（差分を読みやすくするため）"""
    rows = [json.dumps(k, ensure_ascii=False) + ":" + json.dumps(v, ensure_ascii=False, separators=(",", ":")) for k, v in data.items()]
    return "{\n" + ",\n".join(rows) + "\n}\n"


def build_search(arts, bodies):
    data = {}
    for a in sorted(arts, key=lambda x: x["name"]):
        b = bodies[a["name"]]
        data[a["name"]] = {"p": " ".join(b["points"]), "s": b["sections"]}
    return dump_lines(data)


# ---------- 関連する記事 ----------
def normalize(t):
    """全角の英数字を半角にして、小文字にそろえる"""
    return "".join(chr(ord(c) - 0xFEE0) if "０" <= c <= "９" or "Ａ" <= c <= "Ｚ" or "ａ" <= c <= "ｚ" else c for c in t).lower()


def add_terms(t, weight, out):
    """漢字・カタカナの続きは2文字ずつ、英字の語はそのまま数える（ひらがなは助詞が多いので使わない）"""
    for run in re.findall(r"[一-龥々]+|[ァ-ヶー]+|[a-z][a-z0-9]+", normalize(t)):
        if len(run) == 1:
            continue
        keys = [run] if re.match(r"[a-z]", run) else [run[i:i + 2] for i in range(len(run) - 1)]
        for k in keys:
            out[k] = out.get(k, 0) + weight


def build_related(arts, bodies):
    """本文の言葉の近さ（TF-IDF のコサイン類似度）で、記事ごとに近い順の4件を選ぶ。
    題名と見出しの言葉は重く数える。ありふれた言葉（4割を超える記事に出る）は使わない。"""
    n = len(arts)
    counts = []
    for a in arts:
        b = bodies[a["name"]]
        c = {}
        add_terms(b["text"], 1, c)
        for h in b["headings"]:
            add_terms(h, 3, c)
        add_terms(a["title"], 6, c)
        counts.append(c)
    df = {}
    for c in counts:
        for k in c:
            df[k] = df.get(k, 0) + 1
    vecs = []
    for c in counts:
        v = {k: (1 + math.log(x)) * math.log(n / df[k]) for k, x in c.items() if df[k] <= n * 0.4}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        vecs.append({k: x / norm for k, x in v.items()})
    data = {}
    for i, a in enumerate(arts):
        scored = []
        for j, b in enumerate(arts):
            if i == j:
                continue
            small, large = (vecs[i], vecs[j]) if len(vecs[i]) <= len(vecs[j]) else (vecs[j], vecs[i])
            score = sum(x * large.get(k, 0.0) for k, x in small.items())
            if b["cat"] == a["cat"]:
                score += SAME_CATEGORY_BONUS
            # 端数の違いで順番が変わらないよう、6けたに丸めてから並べる（同点は index.html の順）
            scored.append((-round(score, 6), j))
        scored.sort()
        data[a["name"]] = [arts[j]["name"] for _, j in scored[:RELATED_COUNT]]
    return dump_lines(dict(sorted(data.items())))


# ---------- RSS ----------
def rfc822(date):
    d = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone(timedelta(hours=9)))
    return format_datetime(d)


def build_feed(arts):
    with open("index.html", encoding="utf-8") as f:
        desc = html.unescape(re.search(r'name="description" content="([^"]*)"', f.read()).group(1))

    def esc(t):
        return html.escape(t, quote=False)

    newest = sorted(arts, key=lambda a: -a["seq"])[:FEED_COUNT]
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "<channel>",
        f"  <title>{esc(SITE)}</title>",
        f"  <link>{BASE}</link>",
        f"  <description>{esc(desc)}</description>",
        "  <language>ja</language>",
        f'  <atom:link href="{BASE}{FEED_PATH}" rel="self" type="application/rss+xml"/>',
    ]
    if newest:
        out.append(f"  <lastBuildDate>{rfc822(max(a['date'] for a in newest))}</lastBuildDate>")
    for a in newest:
        url = f"{BASE}articles/{a['name']}.html"
        out += [
            "  <item>",
            f"    <title>{esc(a['title'])}</title>",
            f"    <link>{url}</link>",
            f'    <guid isPermaLink="true">{url}</guid>',
            f"    <pubDate>{rfc822(a['date'])}</pubDate>",
            f"    <category>{esc(a['cat'])}</category>",
            f"    <description>{esc(a['desc'])}</description>",
            "  </item>",
        ]
    out += ["</channel>", "</rss>", ""]
    return "\n".join(out)


def build_all():
    """{ファイル名: 中身} を返す"""
    arts = read_index()
    bodies = {a["name"]: read_article(a["name"]) for a in arts}
    return {SEARCH_PATH: build_search(arts, bodies), RELATED_PATH: build_related(arts, bodies), FEED_PATH: build_feed(arts)}


def read_text(path):
    try:
        with open(path, encoding="utf-8", newline="") as f:
            return f.read()
    except FileNotFoundError:
        return None


def stale():
    """作り直すと中身が変わるファイル（＝古くなっているファイル）の一覧"""
    return [path for path, want in build_all().items() if read_text(path) != want]


def write_all():
    changed = []
    for path, want in build_all().items():
        if read_text(path) != want:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(want)
            changed.append(path)
    return changed


def main():
    if not os.path.exists("CLAUDE.md"):
        sys.exit("リポジトリのルートで実行してください")
    if "--check" in sys.argv[1:]:
        old = stale()
        print("古くなっている: " + ", ".join(old) if old else "最新です")
        sys.exit(1 if old else 0)
    changed = write_all()
    print("検索用データ・関連する記事・RSS: " + ("更新 " + ", ".join(changed) if changed else "変更なし"))


if __name__ == "__main__":
    main()
