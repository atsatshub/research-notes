# research-notes — お得情報・調べものまとめ

気になったことやお得情報を調べて、**出典付き**でまとめるサイトです。
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
├── index.html         トップページ（記事一覧・検索・カテゴリ絞り込み）
├── about.html         このサイトについて（出典・調査日の方針、個人情報、免責）
├── 404.html           ページが見つからないときの表示
├── template.html      記事のひな形（articles/ にコピーして使う）
├── articles/          記事ファイルを置くフォルダ
│   └── images/        記事で使う画像（記事ごとのフォルダに分ける）
├── assets/
│   ├── style.css      共通デザイン（ライト/ダーク対応）
│   ├── site.js        全ページ共通: 表示設定（文字の大きさ・配色）、読了の目安、共有、トップへ戻る、検索
│   ├── article.js     記事ページ: 出典の吹き出し、「くわしく」の一括開閉
│   ├── favicon.svg ほか  サイトのアイコン
│   └── ogp.png        SNSで共有されたときの画像
├── sitemap.xml        検索エンジン向けのページ一覧
├── tools/             記事づくりの補助ツール（ビルド・チェック。サイト本体は依存しない）
├── CLAUDE.md          記事作成ルール
├── .nojekyll          GitHub Pages で Jekyll 処理をしないための設定
└── README.md          このファイル
```

## 記事の追加方法

1. `template.html` を `articles/` にコピーする（ファイル名は英小文字・数字・ハイフン。例: `articles/furusato-nozei-basics.html`）
2. `【 】` の部分を書き換え、出典と調査日を記入する
3. `index.html` の記事一覧と `sitemap.xml` に1件追加する
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

## 免責事項

掲載情報は各記事の調査日時点のものです。制度・キャンペーン・価格は変更・終了されることがあります。
正確性には注意していますが、内容を保証するものではありません。
