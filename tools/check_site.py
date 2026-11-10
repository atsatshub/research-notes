"""サイト全体の静的チェック（ブラウザ不要。任意の補助ツール）。

使い方（リポジトリのルートで）:
    python3 -I tools/check_site.py

CLAUDE.md のルールのうち、HTML を読むだけで確かめられるものを調べる。
- 全ページ: lang="ja"・文字コード・viewport・アイコン・site.js・canonical・OGP・「本文へ移動」のリンク
- 記事: canonical / og:url が記事の URL と一致、og:title / og:description が title / description と一致、
  article.js、調査日、index.html と sitemap.xml への掲載、sitemap の lastmod（更新日があれば更新日）、
  出典番号 [n] と出典一覧の対応・連番・件数、目次などのページ内リンク、記事間リンク、
  表の table-wrap、画像の alt、取り消し線、【 】プレースホルダの残り、閉じ忘れタグ、重複 id、
  パンくずのカテゴリ（index.html の見出しと同じ名前で、絞り込みへのリンクになっているか）、
  構造化データ（JSON-LD の題名・日付が本文と同じか。違うときは tools/update_pages.py を実行する）
- トップ: 記事カードの data-seq（追加順の通し番号）が全件にあり、重複していないか、
  サムネイル（tools/make_thumbs.py が入れる）が全カードに1つずつあり、写真のファイルと
  「記事一覧の写真の出典」の行がそろっているか、カテゴリの見出しのアイコン（data-icon）が
  assets/style.css に定義されているか
- 文字数: 要点まとめ 45字・ひとこと（item-point）35字・「くわしく」の箇条書き 60字（目安は40字前後）、
  1文に強調（strong）は1か所まで
問題がなければ「ALL OK」と出る。
"""
import glob
import html
import json
import os
import re
import sys
from html.parser import HTMLParser

BASE = "https://atsatshub.github.io/research-notes/"
ROOT_PAGES = ["index.html", "about.html", "privacy.html", "404.html"]


class TagChecker(HTMLParser):
    VOID = {"meta", "link", "br", "img", "input", "hr", "wbr", "source", "area", "col", "embed", "param", "track"}
    OPTIONAL_END = {"p", "li", "dt", "dd", "tr", "td", "th", "option"}

    def __init__(self):
        super().__init__()
        self.stack, self.errors, self.ids = [], [], []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if "id" in d:
            self.ids.append(d["id"])
        if tag not in self.VOID:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                bad = [t for t, _ in self.stack[i + 1:] if t not in self.OPTIONAL_END]
                if bad:
                    self.errors.append(f"閉じ忘れ {bad}（</{tag}> の前、{self.getpos()}）")
                del self.stack[i:]
                return
        self.errors.append(f"対応のない </{tag}>（{self.getpos()}）")


def text(fragment):
    fragment = re.sub(r'<a class="ref"[^>]*>\[\d+\]</a>', "", fragment)
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def check_common(path, s, out):
    p = TagChecker()
    p.feed(s)
    out += p.errors[:3]
    if p.stack:
        out.append("閉じていないタグ " + str([t for t, _ in p.stack][:5]))
    dup = sorted({i for i in p.ids if p.ids.count(i) > 1})
    if dup:
        out.append("重複 id " + str(dup))
    need = ['<html lang="ja">', 'charset="utf-8"', 'name="viewport"', 'rel="icon"', "assets/site.js",
            'class="skip-link" href="#main"', '<main class="container" id="main">']
    if path != "404.html":
        need += ['rel="canonical"', "og:url", "og:title", "og:description", "twitter:card"]
    for n in need:
        if n not in s:
            out.append("ない: " + n)


def check_article(f, s, idx, sm, out):
    url = BASE + f
    can = re.search(r'rel="canonical" href="([^"]+)"', s)
    if not can or can.group(1) != url:
        out.append("canonical が記事のURLと違う")
    og = re.search(r'og:url" content="([^"]+)"', s)
    if not og or og.group(1) != url:
        out.append("og:url が記事のURLと違う")
    title = re.search(r"<title>(.*?)</title>", s).group(1)
    ogt = re.search(r'og:title" content="([^"]+)"', s)
    if not ogt or not title.startswith(ogt.group(1)):
        out.append("og:title が title と違う")
    desc = re.search(r'name="description" content="([^"]+)"', s)
    ogd = re.search(r'og:description" content="([^"]+)"', s)
    if not desc or not ogd or desc.group(1) != ogd.group(1):
        out.append("og:description が description と違う")
    if "assets/article.js" not in s:
        out.append("article.js がない")
    # パンくずのカテゴリ（index.html の見出しと同じ名前で、絞り込みへのリンク）
    cats = {re.sub(r"（.*?）", "", c).strip() for c in re.findall(r'<h3 class="article-group-title"[^>]*>(.*?)</h3>', idx)}
    crumb = re.search(r'<p class="breadcrumb"><a href="\.\./index\.html">トップ</a> › <a href="\.\./index\.html\?cat=[^"]+">([^<]+)</a></p>', s)
    if not crumb:
        out.append("パンくずのカテゴリがリンクになっていない（tools/update_pages.py を実行）")
    elif crumb.group(1) not in cats:
        out.append("パンくずのカテゴリが index.html の見出しにない: " + crumb.group(1))
    # 構造化データ（題名・日付が本文と同じか）
    ld = re.search(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)
    h1 = re.search(r"<h1>(.*?)</h1>", s, re.S)
    try:
        art = json.loads(ld.group(1))["@graph"][0]
    except (AttributeError, ValueError, KeyError, IndexError):
        art = None
    if not art:
        out.append("構造化データ（JSON-LD）がない（tools/update_pages.py を実行）")
    else:
        date = re.search(r'調査日: <time datetime="(\d{4}-\d\d-\d\d)">', s)
        upds = re.findall(r'更新日: <time datetime="([\d-]+)"', s)
        want = {
            "headline": text(h1.group(1)) if h1 else "",
            "datePublished": date.group(1) if date else "",
            "dateModified": upds[-1] if upds else (date.group(1) if date else ""),
            "mainEntityOfPage": url,
        }
        for k, v in want.items():
            if art.get(k) != v:
                out.append(f"構造化データの {k} が本文と違う（tools/update_pages.py を実行）")
    tm = re.search(r'調査日: <time datetime="(\d{4}-\d\d-\d\d)">', s)
    if not tm:
        out.append("調査日の <time> がない")
    if f'href="{f}"' not in idx:
        out.append("index.html の記事一覧にない")
    m = re.search(re.escape(url) + r"</loc><lastmod>([\d-]+)", sm)
    if not m:
        out.append("sitemap.xml にない")
    elif tm:
        upd = re.findall(r'更新日: <time datetime="([\d-]+)"', s)
        want = upd[-1] if upd else tm.group(1)
        if m.group(1) != want:
            out.append(f"sitemap の lastmod {m.group(1)} が {want} と違う")
    # 出典
    ids = [int(x) for x in re.findall(r'id="src-(\d+)"', s)]
    refs = {int(x) for x in re.findall(r'href="#src-(\d+)"', s)}
    if ids != list(range(1, len(ids) + 1)):
        out.append("出典の id が 1 からの連番になっていない")
    if refs - set(ids):
        out.append("出典一覧にない番号を参照 " + str(sorted(refs - set(ids))))
    if set(ids) - refs:
        out.append("本文で参照していない出典 " + str(sorted(set(ids) - refs)))
    cnt = re.search(r"<summary>出典（(\d+)件）</summary>", s)
    if not cnt or int(cnt.group(1)) != len(ids):
        out.append("「出典（N件）」の件数が違う")
    if "閲覧日はいずれも" not in s:
        out.append("閲覧日の一文がない")
    # リンク
    for a in re.findall(r'href="#([\w-]+)"', s):
        if not a.startswith("src-") and f'id="{a}"' not in s:
            out.append("ページ内リンク先がない #" + a)
    for a in re.findall(r'href="((?!https?:|#|\.\./|mailto:)[^"#]+\.html)', s):
        if not os.path.exists(os.path.join("articles", a)):
            out.append("記事間リンク先がない " + a)
    # 表・画像・禁止事項
    for mt in re.finditer(r"<table", s):
        if "table-wrap" not in s[:mt.start()].rstrip()[-40:]:
            out.append("table-wrap で囲んでいない表がある")
    if re.search(r"<img(?![^>]*\balt=)", s):
        out.append("alt のない画像がある")
    if re.search(r"<(del|s)>|line-through", s):
        out.append("取り消し線（見え消し）がある")
    body = re.sub(r'<ol class="sources">.*?</ol>', "", s, flags=re.S)
    if "【" in body:
        out.append("【 】のプレースホルダが残っている可能性")
    # 文字数・強調
    summ = re.search(r'<section class="summary".*?</section>', s, re.S)
    if not summ:
        out.append("要点まとめがない")
    else:
        lis = re.findall(r"<li>(.*?)</li>", summ.group(0), re.S)
        if not 3 <= len(lis) <= 5:
            out.append(f"要点まとめが {len(lis)} 行（3〜5行）")
        for li in lis:
            if len(text(li)) > 45:
                out.append(f"要点まとめ {len(text(li))}字: {text(li)}")
    for pt in re.findall(r'<p class="item-point">(.*?)</p>', s, re.S):
        if len(text(pt)) > 35:
            out.append(f"ひとこと {len(text(pt))}字: {text(pt)}")
    for d in re.findall(r'<details class="item-more">(.*?)</details>', s, re.S):
        for li in re.findall(r"<li>(.*?)</li>", d, re.S):
            t = text(li)
            if len(t) > 60 and len(re.sub(r"[ -~]", "", t)) > 40:
                out.append(f"くわしく {len(t)}字: {t[:40]}…")
    for frag in re.findall(r"<(?:li|p|dd|td)[^>]*>(.*?)</(?:li|p|dd|td)>", s, re.S):
        if frag.count("<strong>") > 1:
            out.append("1文に強調が2つ: " + text(frag)[:40])
    if s.count('class="item-card"') and 'class="expand-all"' not in s:
        out.append("「すべて開く」ボタンがない")


def lp(path):
    """Windows で 260 文字を超えるパスも調べられるようにする（作業フォルダが深いときのため）"""
    if os.name == "nt":
        return "\\\\?\\" + os.path.abspath(path)
    return path


def check_thumbs(idx):
    out = []
    css = open("assets/style.css", encoding="utf-8").read()
    defined = set(re.findall(r'\[data-icon="([a-z]+)"\]\s*\{[^}]*--icon:', css))
    for key in re.findall(r'<h3 class="article-group-title"(?: data-icon="([a-z]*)")?>', idx):
        if not key:
            out.append("カテゴリの見出しに data-icon がない")
        elif key not in defined:
            out.append(f"アイコン {key} が assets/style.css に定義されていない")
    credits_box = re.search(r'<details class="sources-box" id="photo-credits">(.*?)</details>', idx, re.S)
    credit_ids = set(re.findall(r'<li id="credit-([a-z0-9-]+)">', credits_box.group(1))) if credits_box else set()
    photo_slugs = set()
    for slug, body in re.findall(r'<a class="article-card" href="articles/([a-z0-9-]+)\.html">(.*?)</a>', idx, re.S):
        thumbs = re.findall(r'<span class="article-card-thumb( is-icon)?"(?: data-icon="([a-z]+)")?[^>]*>(.*?)</span>', body)
        if len(thumbs) != 1:
            out.append(f"{slug}: サムネイルがない、または2つ以上ある（tools/make_thumbs.py を実行）")
            continue
        is_icon, key, inner = thumbs[0]
        if is_icon:
            if key not in defined:
                out.append(f"{slug}: アイコン {key} が assets/style.css に定義されていない")
            continue
        photo_slugs.add(slug)
        src = re.search(r'<img src="([^"]+)" width="\d+" height="\d+" alt=""', inner)
        if not src or src.group(1) != f"articles/images/thumbs/{slug}.jpg":
            out.append(f"{slug}: サムネイルの画像の書き方が違う（tools/make_thumbs.py を実行）")
        elif not os.path.exists(lp(src.group(1))):
            out.append(f"{slug}: サムネイルの画像がない: {src.group(1)}（tools/make_thumbs.py を実行）")
        if slug not in credit_ids:
            out.append(f"{slug}: 「記事一覧の写真の出典」に行がない（tools/make_thumbs.py を実行）")
    for slug in sorted(credit_ids - photo_slugs):
        out.append(f"{slug}: 写真のない記事の出典の行が残っている（tools/make_thumbs.py を実行）")
    return out


def main():
    if not os.path.exists("CLAUDE.md"):
        sys.exit("リポジトリのルートで実行してください")
    # Windows の端末（cp932 など）で「¥」などを表示できず止まらないようにする
    sys.stdout.reconfigure(errors="backslashreplace")
    idx = open("index.html", encoding="utf-8").read()
    sm = open("sitemap.xml", encoding="utf-8").read()
    total = 0
    # Windows では glob が「articles\xxx.html」を返すので、区切りを「/」にそろえる
    # （そろえないと記事として扱われず、記事のチェックが丸ごと飛ばされる）
    articles = sorted(p.replace(os.sep, "/") for p in glob.glob("articles/*.html"))
    for f in articles + ROOT_PAGES:
        s = open(f, encoding="utf-8").read()
        out = []
        check_common(f, s, out)
        if f.startswith("articles/"):
            check_article(f, s, idx, sm, out)
        if out:
            total += len(out)
            print("==", f)
            for o in out:
                print("  -", o)
    # トップ: 記事カードの data-seq（追加順の通し番号）
    cards = re.findall(r'<li( data-seq="(\d+)")?>\s*<a class="article-card" href="articles/[a-z0-9-]+\.html"', idx)
    seqs = [n for _, n in cards if n]
    if len(seqs) != len(cards) or len(set(seqs)) != len(seqs):
        print("== index.html")
        print("  - 記事カードの data-seq がない、または重複している")
        total += 1
    # トップ: サムネイルと写真の出典、カテゴリのアイコン
    thumb_errs = check_thumbs(idx)
    if thumb_errs:
        print("== index.html（サムネイル・アイコン）")
        for o in thumb_errs:
            print("  -", o)
        total += len(thumb_errs)
    for loc in re.findall(r"<loc>([^<]+)</loc>", sm):
        p = loc.replace(BASE, "") or "index.html"
        if not os.path.exists(p):
            print("== sitemap.xml\n  - 存在しないページ", loc)
            total += 1
    print("ALL OK" if total == 0 else f"{total} 件の指摘")
    sys.exit(1 if total else 0)


if __name__ == "__main__":
    main()
