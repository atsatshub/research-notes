"""記事一覧（index.html）のサムネイルと、その写真の出典をそろえる（任意の補助ツール。Pillow が必要）。

使い方（リポジトリのルートで）:
    python3 -I tools/make_thumbs.py            # 足りないサムネイルだけ作り、index.html を作り直す
    python3 -I tools/make_thumbs.py --force    # サムネイルをすべて作り直す（記事の最初の写真を差し替えたとき）

何度実行しても同じ結果になる。記事を index.html に追加したら実行する。

1. 各記事の最初の写真（<figure class="photo"> の <img>）の中央を 4:3 で切り抜き、
   480×360 に縮めて articles/images/thumbs/<記事名>.jpg に保存する（埋め込み情報は付けない）。
   ほかの記事と同じ写真になる・被写体が端にあるときは、下の ADJUST で写真や切り抜く位置を変える。
2. index.html の記事カードの先頭に、サムネイルを入れる。写真がない記事は、
   そのカテゴリのアイコン（見出しの data-icon。絵は assets/style.css）を入れる。
3. index.html の末尾に「写真の出典」を作り直す。中身は、各記事の「写真・画像の出典」から
   その写真の行を引き写したもの（id="credit-<記事名>"。記事ページの「同じカテゴリの記事」でも使う）。
"""
import html
import os
import re
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow（PIL）が必要です")

THUMB_DIR = "articles/images/thumbs"
W, H = 480, 360
# 記事ごとの調整。pick: 使う写真のファイル名（既定は最初の写真）、
# focus: 縦長の写真を切り抜く高さの位置（0 = 上端、1 = 下端。既定は 0.4）
ADJUST = {
    "kenshin-kekka-mikata": {"pick": "blood-tubes.jpg"},  # 最初の写真が 30s-checklist-2026 と同じため
    "smartphone-kaikae-2026": {"focus": 1.0},  # スマートフォンが写真の下端にあるため
}
CREDITS_RE = re.compile(r"    <details class=\"sources-box\" id=\"photo-credits\">.*?</details>\r?\n", re.S)


def lp(path):
    """Windows で 260 文字を超えるパスも開けるようにする（作業フォルダが深いときのため）"""
    if os.name == "nt":
        return "\\\\?\\" + os.path.abspath(path)
    return path


def plain(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def first_photo(article_html, pick=None):
    """記事の最初の写真（pick があればその名前の写真）の (画像のパス, 見出し, 出典の行の中身) を返す。写真がなければ None"""
    figs = re.findall(r'<figure class="photo">\s*<img src="([^"]+)"[^>]*>\s*<figcaption>(.*?)</figcaption>', article_html, re.S)
    if not figs:
        return None
    i = 0
    if pick:
        hits = [k for k, f in enumerate(figs) if f[0].endswith("/" + pick)]
        if not hits:
            sys.exit(f"指定した写真 {pick} が記事にない")
        i = hits[0]
    src, cap = figs[i]
    box = re.search(r'id="photo-credits">(.*?)</details>', article_html, re.S)
    lis = re.findall(r"<li>(.*?)</li>", box.group(1), re.S) if box else []
    cap_t = plain(cap)
    found = None
    for li in lis:  # 写真の説明が一致する行
        if plain(li.split("<br>")[0]) == cap_t:
            found = li
            break
    if found is None:
        for li in lis:  # 一致しなければ、説明の書き出しが同じ行
            head = plain(li.split("<br>")[0])
            if head and (head.startswith(cap_t[:10]) or cap_t.startswith(head[:10])):
                found = li
                break
    if found is None and len(lis) == len(figs):  # それでもなければ、同じ順番の行
        found = lis[i]
    if found is None or "<br>" not in found:
        return (src, cap_t, None)
    return (src, cap_t, found.split("<br>", 1)[1].strip())


def make_thumb(src_path, out_path, focus=0.4):
    im = Image.open(lp(src_path)).convert("RGB")
    w, h = im.size
    if w / h > W / H:  # 横長: 左右を切る
        nw = round(h * W / H)
        box = ((w - nw) // 2, 0, (w - nw) // 2 + nw, h)
    else:  # 縦長: 上下を切る（既定は少し上寄りにして、被写体が切れにくいようにする）
        nh = round(w * H / W)
        top = max(0, min(h - nh, round((h - nh) * focus)))
        box = (0, top, w, top + nh)
    im = im.crop(box).resize((W, H), Image.LANCZOS)
    im.save(lp(out_path), "JPEG", quality=78, optimize=True, progressive=True)


def main():
    if not os.path.exists("CLAUDE.md"):
        sys.exit("リポジトリのルートで実行してください")
    force = "--force" in sys.argv[1:]
    os.makedirs(THUMB_DIR, exist_ok=True)
    with open("index.html", encoding="utf-8", newline="") as f:
        idx = f.read()
    nl = "\r\n" if "\r\n" in idx else "\n"

    # 見出し（カテゴリ）ごとのアイコンのキー
    icon_at = [(m.start(), m.group(1)) for m in re.finditer(r'<h3 class="article-group-title" data-icon="([a-z]+)">', idx)]

    def icon_for(pos):
        key = None
        for p, k in icon_at:
            if p < pos:
                key = k
        return key

    made, credits, warn = 0, [], []
    card_re = re.compile(r'(        <a class="article-card" href="articles/([a-z0-9-]+)\.html">' + nl + r')(?:          <span class="article-card-thumb[^\r\n]*' + nl + r')?')

    def card(m):
        nonlocal made
        slug = m.group(2)
        with open(f"articles/{slug}.html", encoding="utf-8") as f:
            art = f.read()
        adj = ADJUST.get(slug, {})
        photo = first_photo(art, adj.get("pick"))
        if photo and photo[2]:
            out = f"{THUMB_DIR}/{slug}.jpg"
            if force or not os.path.exists(lp(out)):
                make_thumb(os.path.join("articles", photo[0]), out, adj.get("focus", 0.4))
                made += 1
            # 題名の前半（「：」または「？ 」まで）
            title = re.split(r"：|(?<=？)\s+", plain(re.search(r"<h1>(.*?)</h1>", art, re.S).group(1)))[0]
            credits.append(f'          <li id="credit-{slug}"><a href="articles/{slug}.html">{html.escape(title)}</a> の写真<br>{photo[2]}</li>')
            thumb = f'<span class="article-card-thumb"><img src="{THUMB_DIR}/{slug}.jpg" width="{W}" height="{H}" alt="" loading="lazy" decoding="async"></span>'
        else:
            if photo:
                warn.append(f"{slug}: 写真の出典の行が見つからないので、アイコンにした")
            key = icon_for(m.start())
            if not key:
                sys.exit(f"{slug}: カテゴリの見出しに data-icon がない")
            thumb = f'<span class="article-card-thumb is-icon" data-icon="{key}" aria-hidden="true"></span>'
        return m.group(1) + "          " + thumb + nl

    idx, n = card_re.subn(card, idx)

    # 写真の出典（index.html の末尾、</main> の直前）
    idx = CREDITS_RE.sub("", idx)
    block = (f'    <details class="sources-box" id="photo-credits">{nl}'
             f"      <summary>記事一覧の写真の出典（{len(credits)}件）</summary>{nl}"
             f'      <p class="sources-note">記事一覧の小さな写真は、各記事の最初の写真の中央を切り抜いて縮小したものです。</p>{nl}'
             f'      <ol class="sources">{nl}' + nl.join(credits) + f"{nl}      </ol>{nl}"
             f"    </details>{nl}")
    assert idx.count("  </main>") == 1
    idx = idx.replace("  </main>", block + "  </main>", 1)
    with open("index.html", "w", encoding="utf-8", newline="") as f:
        f.write(idx)

    # 一覧にない記事のサムネイルが残っていれば知らせる（消さない）
    slugs = set(re.findall(r'href="articles/([a-z0-9-]+)\.html"', idx))
    extra = sorted(p for p in os.listdir(lp(THUMB_DIR)) if p.endswith(".jpg") and p[:-4] not in slugs)
    for w in warn:
        print("注意:", w)
    if extra:
        print("注意: 一覧にない記事のサムネイル:", ", ".join(extra))
    print(f"カード {n} 件、写真 {len(credits)} 件（新しく作ったサムネイル {made} 件）、アイコン {n - len(credits)} 件")


if __name__ == "__main__":
    main()
