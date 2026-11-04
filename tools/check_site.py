"""サイト全体の静的チェック（ブラウザ不要。任意の補助ツール）。

使い方（リポジトリのルートで）:
    python3 -I tools/check_site.py

CLAUDE.md のルールのうち、HTML を読むだけで確かめられるものを調べる。
- 全ページ: lang="ja"・文字コード・viewport・アイコン・site.js・canonical・OGP
- 記事: canonical / og:url が記事の URL と一致、og:title / og:description が title / description と一致、
  article.js、調査日、index.html と sitemap.xml への掲載、sitemap の lastmod（更新日があれば更新日）、
  出典番号 [n] と出典一覧の対応・連番・件数、目次などのページ内リンク、記事間リンク、
  表の table-wrap、画像の alt、取り消し線、【 】プレースホルダの残り、閉じ忘れタグ、重複 id
- 文字数: 要点まとめ 45字・ひとこと（item-point）35字・「くわしく」の箇条書き 60字（目安は40字前後）、
  1文に強調（strong）は1か所まで
問題がなければ「ALL OK」と出る。
"""
import glob
import html
import os
import re
import sys
from html.parser import HTMLParser

BASE = "https://atsatshub.github.io/research-notes/"
ROOT_PAGES = ["index.html", "about.html", "404.html"]


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
    need = ['<html lang="ja">', 'charset="utf-8"', 'name="viewport"', 'rel="icon"', "assets/site.js"]
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
    for loc in re.findall(r"<loc>([^<]+)</loc>", sm):
        p = loc.replace(BASE, "") or "index.html"
        if not os.path.exists(p):
            print("== sitemap.xml\n  - 存在しないページ", loc)
            total += 1
    print("ALL OK" if total == 0 else f"{total} 件の指摘")
    sys.exit(1 if total else 0)


if __name__ == "__main__":
    main()
