#!/usr/bin/env python3
"""サイトの公開URL（ベースURL）を一括で書き換える。

独自ドメインへ切り替えるときに使う。書き換えるのは次の4種類。
  1. 全ページの canonical / og:url / og:image などの絶対URL
  2. sitemap.xml の <loc>
  3. 404.html のルートからの絶対パス（/research-notes/ → /）
  4. tools/check_site.py の BASE

使い方（リポジトリのルートで）:
  python3 -I tools/change_base_url.py https://atsatshub.github.io/research-notes/ https://example.com/

末尾の「/」は省いても補う。書き換えたファイル名を表示する。
"""
import glob
import os
import sys


def main():
    if len(sys.argv) != 3:
        sys.exit("使い方: change_base_url.py <今のURL> <新しいURL>")
    old, new = (u if u.endswith("/") else u + "/" for u in sys.argv[1:3])
    if not os.path.exists("CLAUDE.md"):
        sys.exit("リポジトリのルートで実行してください")
    # 404.html はルートからのパスで書いてあるので、パス部分だけを取り出す
    old_path = "/" + old.split("/", 3)[3] if old.count("/") >= 3 else "/"
    new_path = "/" + new.split("/", 3)[3] if new.count("/") >= 3 else "/"

    targets = sorted(glob.glob("*.html") + glob.glob("articles/*.html")) + ["sitemap.xml", "tools/check_site.py"]
    changed = 0
    for f in targets:
        s = open(f, encoding="utf-8").read()
        t = s.replace(old, new)
        if f == "404.html" and old_path != new_path:
            t = t.replace('href="' + old_path, 'href="' + new_path).replace('src="' + old_path, 'src="' + new_path)
        if t != s:
            open(f, "w", encoding="utf-8", newline="\n").write(t)
            print("書き換え:", f)
            changed += 1
    print(f"{changed} ファイルを書き換えました。tools/check_site.py で確認してください。")


if __name__ == "__main__":
    main()
