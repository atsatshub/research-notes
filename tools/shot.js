/*
  ページの一部をスクリーンショットして、見た目を目で確かめる（Playwright を使う任意の補助ツール）

  使い方（リポジトリのルートで）:
    node tools/shot.js <ページ> <出力先の接頭辞> <light|dark> <CSSセレクタ[@番号]> ...
  例:
    node tools/shot.js articles/xxx.html /tmp/shots/xxx light ".summary" "figure.bar-chart@0" "div.table-wrap@1"
  → /tmp/shots/xxx-0.png, xxx-1.png, ... に保存する（幅375px）。
  出力先はリポジトリの外（作業用のフォルダ）にすること。
*/
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [page, out, scheme, ...sels] = process.argv.slice(2);
  if (!page || !out || !sels.length) {
    console.log("usage: node tools/shot.js <page> <out-prefix> <light|dark> <selector[@n]> ...");
    process.exit(1);
  }
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 375, height: 800 }, colorScheme: scheme || "light" });
  await p.goto("file://" + path.resolve(page));
  let i = 0;
  for (const s of sels) {
    const [sel, n] = s.split("@");
    await p.locator(sel).nth(Number(n || 0)).screenshot({ path: `${out}-${i++}.png` });
  }
  await b.close();
  console.log("saved", i, "images");
})();
