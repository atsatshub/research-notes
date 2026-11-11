# research-notes — 雑学アーカイブ

暮らしの制度やお得、おでかけ、学び、仕事の道具まで、気になったことを調べて、**出典付き**で短くまとめるサイトです。
誰でも閲覧できるよう、GitHub Pages で公開します。

- 公開URL（GitHub Pages 有効化後）: https://atsatshub.github.io/research-notes/

## このサイトの方針

- **出典を必ず明記**: 事実には出典URLを付け、公的機関・公式サイトの情報を優先します。
- **調査日を明記**: お得情報は変わりやすいため、各記事に調査日（更新日）を記載します。
- **個人情報は載せません**: 氏名・住所・メール・勤務先など個人を特定できる情報は掲載しません。
- **シンプルな作り**: HTML と CSS（必要な場合のみ素の JavaScript）で作り、ビルドツールは使いません。スマホでも読みやすいレイアウトです。

詳しい記事作成ルールは [CLAUDE.md](CLAUDE.md) を参照してください。

## ファイル構成

```
.
├── index.html         トップページ（記事一覧・検索・カテゴリ絞り込み・並び順の切り替え）
├── about.html         このサイトについて（運営者、出典・調査日の方針、お問い合わせ、広告）
├── privacy.html       プライバシーポリシー（表示設定の保存、広告配信事業者の Cookie、免責）
├── 404.html           ページが見つからないときの表示
├── template.html      記事のひな形（articles/ にコピーして使う）
├── articles/          記事ファイルを置くフォルダ
│   └── images/        記事で使う画像（記事ごとのフォルダに分ける）
│       └── thumbs/    記事一覧のサムネイル（tools/make_thumbs.py が作る）
├── assets/
│   ├── style.css      共通デザイン（ライト/ダーク対応）
│   ├── site.js        全ページ共通: メニュー、表示設定（文字の大きさ・配色）、読了の目安、共有、トップへ戻る、検索、関連する記事、横の目次
│   ├── search-index.json  検索用のデータ（記事の中の見出し・要点。tools/make_data.py が作る）
│   ├── related.json   記事ごとの「関連する記事」（tools/make_data.py が作る）
│   ├── article.js     記事ページ: 出典の吹き出し、「くわしく」の一括開閉
│   ├── favicon.svg ほか  サイトのアイコン
│   └── ogp.png        SNSで共有されたときの画像（トップなど。記事は最初の写真）
├── sitemap.xml        検索エンジン向けのページ一覧
├── feed.xml           新着記事の RSS（tools/make_data.py が作る）
├── tools/             記事づくりの補助ツール（ビルド・チェック。サイト本体は依存しない）
├── CLAUDE.md          記事作成ルール
├── .nojekyll          GitHub Pages で Jekyll 処理をしないための設定
└── README.md          このファイル
```

## 記事の追加方法

1. `template.html` を `articles/` にコピーする（ファイル名は英小文字・数字・ハイフン。例: `articles/furusato-nozei-basics.html`）
2. `【 】` の部分を書き換え、出典と調査日を記入する
3. `index.html` の記事一覧（`data-seq` は追加順の通し番号）と `sitemap.xml` に1件追加し、`python3 -I tools/update_pages.py` を実行する（構造化データ・共有用の画像が入り、検索用のデータ・関連する記事・RSS も作り直される）。続けて `python3 -I tools/make_thumbs.py` を実行する（一覧のサムネイルと写真の出典。Pillow が必要）
4. `tools/check_site.py` と `tools/check_pages.js` で確認してから、コミットしてプッシュする（手順は [tools/README.md](tools/README.md)）

## ローカルでの確認

ビルド不要です。`index.html` をブラウザで直接開くか、簡易サーバーで確認できます。

```bash
python3 -m http.server 8000
```

ブラウザで http://localhost:8000/ を開きます。

## GitHub Pages の有効化

1. GitHub のリポジトリページで **Settings → Pages** を開く
2. **Build and deployment** の Source を「Deploy from a branch」にする
3. Branch を `main`、フォルダを `/ (root)` にして **Save**
4. 数分後に公開URLで閲覧できるようになります

## 独自ドメインに切り替えるとき

1. ドメインを取得し、DNS に GitHub Pages 向けのレコードを設定する（`www` は CNAME、ルートは A/AAAA。手順は GitHub Docs「GitHub Pages サイトのカスタム ドメインを管理する」）。
2. リポジトリの Settings → Pages → Custom domain にドメインを入れる（`CNAME` ファイルが main に作られる）。HTTPS の強制を有効にする。
3. サイト内の絶対URL（canonical・og:url・sitemap・404 のパス）を一括で書き換える:

```bash
python3 -I tools/change_base_url.py https://atsatshub.github.io/research-notes/ https://新しいドメイン/
```

4. `tools/check_site.py` が `ALL OK` になることを確認してコミットする。古いURLは GitHub Pages が自動で新しいドメインへ転送する。

## 広告（Google AdSense）を入れるとき

- `privacy.html` の「広告配信事業者の Cookie」の「現在の状況」を、掲載開始の日付に書き換える。`about.html` の「広告」の文も同じく直す。
- AdSense の管理画面で発行される `ads.txt` をリポジトリのルートに置く（`https://ドメイン/ads.txt` で開けること）。
- 広告コードは `template.html` のコメントで示した位置（要点まとめの下、出典の上）に `div.ad-slot` で入れる。高さを先に確保してあるので、表示後に本文がずれない。
- 「くわしく」の折りたたみの中や、表・グラフの途中には入れない。

## 免責事項

掲載情報は各記事の調査日時点のものです。制度・キャンペーン・価格は変更・終了されることがあります。
正確性には注意していますが、内容を保証するものではありません。
