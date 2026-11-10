# tools/ — 記事づくりの補助ツール

サイト本体（HTML・CSS・素のJS）はこのフォルダに**依存しません**。記事を作る・確かめるときに使う任意の道具です。
どれもリポジトリのルートで実行します。Python は `-I`（隔離モード）で実行します。

| ファイル | 役割 |
|---|---|
| `build_article.py` | 下書き（`[[key]]` で出典を参照）と出典リスト（`sources.py`）から、出典番号を自動で振った完成版を作る |
| `update_pages.py` | 全ページに「本文へ移動」のリンク、パンくずのカテゴリへのリンク、構造化データ（JSON-LD）を入れる。何度実行してもよい。`build_article.py` も最後にこれを呼ぶ |
| `drop_source.py` | 公開済みの記事から出典を1件消し、後ろの番号を詰める |
| `check_site.py` | HTML を読むだけでできるチェック（head・canonical・sitemap・出典の対応・文字数ルールなど） |
| `check_pages.js` | ブラウザ（Playwright）での表示チェック（はみ出し・折りたたみ・出典の吹き出し・印刷・トップの検索） |
| `check_links.py` | 外部リンクが開けるか（200 以外を表示） |
| `shot.js` | ページの一部をスクリーンショットして目で確認する |

## 新しい記事を作る流れ

1. **調査**: 公的機関・公式サイトの情報を集める（CLAUDE.md 第2章の優先順位）。
   - 調べものはサブエージェントに分けて並行で行ってよい。ただし、記事に書く数字・日付・条件は、**自分で公式ページを開いて確かめてから**使う。
   - 確かめられなかったことは載せないか、記事の「今回確認できなかった点」（`.note`）に書く。
   - 自動アクセスを拒むサイト（403 など）は、ブラウザ相当の取得（WebFetch）で読む。ブラウザのふりをするヘッダーを付けて回避することはしない。
2. **下書き**: 作業用フォルダ（リポジトリの外）に `article_src.html` と `sources.py` を作る。
   - `article_src.html` は `template.html` をもとに書く。head（canonical・OGP・site.js）も最初から入れる。
   - 出典を参照する場所に `[[key]]`、出典一覧を置く場所に `<!-- SOURCES -->` と書く。
   - `sources.py` の形式は `build_article.py` の説明を参照。
3. **ビルド**: `python3 -I tools/build_article.py <下書き> <sources.py> articles/<ファイル名>.html`
4. **一覧への追加**: `index.html`（新しい記事が上、カテゴリは `h3.article-group-title`、`<li data-seq="いま一番大きい番号＋1">`）と `sitemap.xml` に追加する。トップページの `lastmod` も追加した日にする。
   - 記事のパンくずのカテゴリ名は、`index.html` の見出しと同じにする（`update_pages.py` がリンクにする）。
   - 公開済みの記事の題名・説明・調査日・更新日を直したら、`python3 -I tools/update_pages.py` で構造化データを作り直す。
5. **確認**:
   - `python3 -I tools/check_site.py` → `ALL OK` になるまで直す
   - `node tools/check_pages.js articles/<新しい記事>.html` → `ALL OK`
   - `python3 -I tools/check_links.py articles/<新しい記事>.html`
   - `node tools/shot.js ...` で、グラフ・表・カードを幅375pxで目で見る（ライトとダーク）
6. **公開**（CLAUDE.md 第6章でオーナーが了承済み）:
   - 作業ブランチにコミットしてプッシュし、プルリクエストを作って `main` にマージする。
   - 直前の PR がマージ済みなら、作業ブランチを `origin/main` から作り直してから始める。
   - GitHub の MCP ツールでマージするときは、`expectedHeadSha` に 40 文字の完全な SHA を渡す（`git rev-parse HEAD`）。
   - マージ後、公開URL（`https://atsatshub.github.io/research-notes/...`）が 200 を返し、新しい内容が出るまで待って確かめる（反映は通常1〜3分）。

## 公開済みの記事を直すとき

- 完成版の HTML を直接編集してよい（下書きは残っていないことがある）。出典を消すときは `drop_source.py` を使う。
- 事実を更新したら、記事冒頭に「更新日」を追加し、免責欄に「〇年〇月〇日更新: 何を更新したか」を一言書く。`sitemap.xml` の lastmod も更新日にする（CLAUDE.md 第3章）。
- 言い回しの修正だけなら更新日は付けなくてよい。

## Playwright について

`check_pages.js` と `shot.js` は Playwright（Chromium）を使います。Claude Code のクラウド環境では最初から入っていて、
`require('playwright')` がどこからでも使えます。ほかの環境では別途用意してください
（サイトのリポジトリに `package.json` などは置きません）。
