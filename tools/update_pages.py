"""全ページに、検索エンジン向けの情報と共通の部品を入れる（任意の補助ツール）。

使い方（リポジトリのルートで）:
    python3 -I tools/update_pages.py            # 全ページ（articles/*.html とトップなど）
    python3 -I tools/update_pages.py articles/xxx.html   # 指定したページだけ

何度実行しても同じ結果になる（すでに入っていれば作り直すだけ）。build_article.py も最後にこれを呼ぶ。

入れるもの:
1. 「本文へ移動」のリンク（<body> の直後）と、移動先の <main id="main">
2. 記事: パンくずのカテゴリを、トップページの絞り込み（index.html?cat=カテゴリ）へのリンクにする
3. 構造化データ（JSON-LD）
   - 記事: Article（題名・説明・調査日・更新日・画像）と BreadcrumbList（トップ › カテゴリ › 記事）
   - トップ: WebSite
   題名・説明・日付は、そのページの <h1>・description・調査日（更新日）から作る。
   記事の題名や日付を直したら、もう一度このツールを実行する（check_site.py が食い違いを知らせる）。
4. 記事: SNS で共有されたときの画像（og:image）を、その記事の最初の写真にする
5. RSS（feed.xml）の案内: <head> の <link rel="alternate">（RSS リーダーが自動で見つける）と、フッターのリンク

全ページを対象にしたとき（ページを指定しないとき）は、最後に tools/make_data.py と同じ処理をして、
検索用のデータ（assets/search-index.json）・関連する記事（assets/related.json）・RSS（feed.xml）も作り直す。
"""
import glob
import html
import json
import os
import re
import sys
from urllib.parse import quote

BASE = "https://atsatshub.github.io/research-notes/"
SITE = "雑学アーカイブ"
ROOT_PAGES = ["index.html", "about.html", "privacy.html", "404.html"]
SKIP = '<a class="skip-link" href="#main">本文へ移動</a>'
LD_RE = re.compile(r'[ \t]*<script type="application/ld\+json">.*?</script>\r?\n', re.S)
CSS_RE = re.compile(r'([ \t]*)<link rel="stylesheet" href="([^"]*)assets/style\.css">')
PRIVACY_RE = re.compile(r'([ \t]*)<li><a href="[^"]*privacy\.html">プライバシーポリシー</a></li>(\r?\n)')
FEED_TITLE = SITE + " 新着記事"
FEED_LABEL = "RSS（新着記事）"


def plain(fragment):
    """タグを除いた文字列（&amp; などは元の文字に戻す）"""
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def ld_script(data, nl):
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f'  <script type="application/ld+json">{body}</script>{nl}'


def article_ld(path, s):
    url = BASE + path
    h1 = plain(re.search(r"<h1>(.*?)</h1>", s, re.S).group(1))
    desc = html.unescape(re.search(r'name="description" content="([^"]*)"', s).group(1))
    date = re.search(r'調査日: <time datetime="(\d{4}-\d\d-\d\d)">', s).group(1)
    upd = re.findall(r'更新日: <time datetime="(\d{4}-\d\d-\d\d)">', s)
    crumb = re.search(r'<p class="breadcrumb">(.*?)</p>', s, re.S)
    cat = plain(crumb.group(1)).split("›")[-1].strip() if crumb else ""
    images = [BASE + "assets/ogp.png"]
    for src in re.findall(r'<img src="(images/[^"]+)"', s):
        u = BASE + "articles/" + src
        if u not in images:
            images.append(u)
    org = {"@type": "Organization", "name": SITE, "url": BASE + "about.html"}
    article = {
        "@type": "Article",
        "headline": h1,
        "description": desc,
        "inLanguage": "ja",
        "datePublished": date,
        "dateModified": upd[-1] if upd else date,
        "mainEntityOfPage": url,
        "image": images,
        "author": org,
        "publisher": dict(org, logo={"@type": "ImageObject", "url": BASE + "assets/apple-touch-icon.png"}),
    }
    items = [{"@type": "ListItem", "position": 1, "name": "トップ", "item": BASE}]
    if cat:
        items.append({"@type": "ListItem", "position": 2, "name": cat, "item": BASE + "?cat=" + quote(cat)})
    items.append({"@type": "ListItem", "position": len(items) + 1, "name": h1})
    return {"@context": "https://schema.org", "@graph": [article, {"@type": "BreadcrumbList", "itemListElement": items}]}


def index_ld(s):
    desc = html.unescape(re.search(r'name="description" content="([^"]*)"', s).group(1))
    return {"@context": "https://schema.org", "@type": "WebSite", "name": SITE, "url": BASE, "inLanguage": "ja", "description": desc}


def apply(path, s):
    """ページの HTML（文字列）を受け取り、部品を入れた HTML を返す。path は「articles/xxx.html」の形。"""
    nl = "\r\n" if "\r\n" in s else "\n"
    # 1. 本文へ移動
    if SKIP not in s:
        s = re.sub(r"(<body[^>]*>)(\r?\n)", lambda m: m.group(1) + m.group(2) + "  " + SKIP + m.group(2), s, count=1)
    if 'id="main"' not in s:
        s = s.replace('<main class="container">', '<main class="container" id="main">', 1)
    # 2. パンくずのカテゴリをリンクに
    if path.startswith("articles/"):
        def crumb(m):
            cat = m.group(2).strip()
            return f'{m.group(1)}<a href="../index.html?cat={quote(cat)}">{cat}</a></p>'
        # すでにリンクになっていても、カテゴリ名からリンク先を作り直す（カテゴリ名を変えたときのため）
        s = re.sub(r'(<p class="breadcrumb"><a href="\.\./index\.html">トップ</a> › )(?:<a href="[^"]*">)?([^<]+)(?:</a>)?</p>', crumb, s, count=1)
    # 3. 構造化データ（</head> の直前に置く。あれば作り直す）
    data = None
    if path.startswith("articles/"):
        data = article_ld(path, s)
    elif path == "index.html":
        data = index_ld(s)
    if data is not None:
        s = LD_RE.sub("", s)
        s = s.replace("</head>", ld_script(data, nl) + "</head>", 1)
    # 4. 記事: 共有されたときの画像を、最初の写真にする（写真がなければサイト共通の画像）
    if path.startswith("articles/"):
        image = og_image(s)
        s = re.sub(r'(<meta property="og:image" content=")[^"]*(">)', lambda m: m.group(1) + image + m.group(2), s, count=1)
    # 5. RSS の案内（<head> と、フッターの「プライバシーポリシー」の次）
    css = CSS_RE.search(s)
    if css:
        indent, prefix = css.group(1), css.group(2)
        if 'type="application/rss+xml"' not in s:
            link = f'{indent}<link rel="alternate" type="application/rss+xml" title="{FEED_TITLE}" href="{prefix}feed.xml">{nl}'
            s = s[:css.start()] + link + s[css.start():]
        if f'feed.xml">{FEED_LABEL}</a>' not in s:
            s = PRIVACY_RE.sub(lambda m: m.group(0) + f'{m.group(1)}<li><a href="{prefix}feed.xml">{FEED_LABEL}</a></li>{m.group(2)}', s, count=1)
    return s


def og_image(s):
    """記事の HTML から、共有されたときに出す画像の URL を返す（最初の写真。なければサイト共通の画像）"""
    photo = re.search(r'<figure class="photo">\s*<img src="(images/[^"]+)"', s)
    return BASE + ("articles/" + photo.group(1) if photo else "assets/ogp.png")


def update_file(path):
    with open(path, encoding="utf-8", newline="") as f:
        s = f.read()
    new = apply(path.replace(os.sep, "/"), s)
    if new != s:
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(new)
    return new != s


def main():
    if not os.path.exists("CLAUDE.md"):
        sys.exit("リポジトリのルートで実行してください")
    targets = sys.argv[1:] or sorted(p.replace(os.sep, "/") for p in glob.glob("articles/*.html")) + ROOT_PAGES
    changed = [p for p in targets if update_file(p)]
    print(f"{len(targets)} ページを確認、{len(changed)} ページを更新")
    if not sys.argv[1:]:
        # 全ページのときは、検索用のデータ・関連する記事・RSS も作り直す
        # -I（隔離モード）ではこのフォルダが検索先に入らないので、自分で足してから読み込む
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import make_data
        made = make_data.write_all()
        print("検索用データ・関連する記事・RSS: " + ("更新 " + ", ".join(made) if made else "変更なし"))


if __name__ == "__main__":
    main()
