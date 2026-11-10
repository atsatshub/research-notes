/*
  ブラウザでの表示チェック（Playwright を使う任意の補助ツール。サイト本体はこれに依存しない）

  使い方（リポジトリのルートで）:
    node tools/check_pages.js                     # 全記事
    node tools/check_pages.js articles/xxx.html   # 指定した記事だけ

  確認すること（記事ごと）
  - 幅375・1024px × ライト・ダークで、JSエラーがない・ページが横にはみ出さない
  - 「くわしく」(details.item-more) が最初は閉じていて、「すべて開く」で全部開き、もう一度押すと閉じる
  - 出典 [n]: マウスを乗せると吹き出しが出る、タップすると移動せずに吹き出しが出る（画面内に収まる）、
    #src-n で開くと出典一覧が開く、リンク切れの [n] がない
  - 幅320px と「文字を大きめ」で、ページが横にはみ出さない／表の中だけが横にスクロールしていないか（参考表示）
  - 印刷時（ダーク設定でも）本文が暗い文字になる
  トップページ: 記事数の表示、カテゴリのボタン、検索の動作
  問題がなければ最後に「ALL OK」と出る。

  Playwright が入っていない環境では、npm で入れるか、使える環境で実行する（CLAUDE.md の方針により、
  サイトのファイルには package.json などを置かない）。
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const files = args.length
  ? args
  : fs.readdirSync(path.join(root, "articles")).filter((f) => f.endsWith(".html")).sort().map((f) => "articles/" + f);
const url = (f) => "file://" + path.join(root, f);

(async () => {
  const b = await chromium.launch();
  let fail = 0;
  const notes = [];
  const ok = (c, m) => {
    if (!c) {
      fail++;
      console.log("  FAIL", m);
    }
  };

  for (const f of files) {
    for (const [w, scheme] of [[375, "light"], [375, "dark"], [1024, "light"], [1024, "dark"]]) {
      const p = await b.newPage({ viewport: { width: w, height: 800 }, colorScheme: scheme });
      const errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      await p.goto(url(f));
      ok(errs.length === 0, `${f} ${w} ${scheme}: JSエラー ${errs}`);
      ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= w, `${f} ${w} ${scheme}: 横にはみ出す`);
      const n = await p.$$eval("details.item-more", (d) => d.length);
      if (n) ok(await p.$$eval("details.item-more", (d) => d.every((x) => !x.open)), `${f}: くわしくが最初から開いている`);
      if (w === 375 && scheme === "light" && n) {
        const btn = p.locator("button.expand-all");
        ok(await btn.isVisible(), `${f}: すべて開くボタンが見えない`);
        await btn.click();
        ok(await p.$$eval("details.item-more", (d) => d.every((x) => x.open)), `${f}: すべて開くで開かない`);
        ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= w, `${f}: 全部開くと横にはみ出す`);
        await btn.click();
        ok(await p.$$eval("details.item-more", (d) => d.every((x) => !x.open)), `${f}: もう一度押しても閉じない`);
      }
      if (w === 1024 && scheme === "light" && (await p.$("a.ref"))) {
        await p.locator("a.ref").first().hover();
        await p.waitForTimeout(100);
        ok(!!(await p.$(".ref-pop")), `${f}: マウスを乗せても吹き出しが出ない`);
        await p.mouse.move(5, 5);
        await p.waitForTimeout(400);
        ok(!(await p.$(".ref-pop")), `${f}: 吹き出しが消えない`);
      }
      await p.close();
    }

    // タップで吹き出し
    const ctx = await b.newContext({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });
    const m = await ctx.newPage();
    await m.goto(url(f));
    if (await m.$("a.ref")) {
      const before = await m.evaluate(() => location.hash);
      await m.locator("a.ref").first().tap();
      await m.waitForTimeout(150);
      ok(!!(await m.$(".ref-pop")), `${f}: タップで吹き出しが出ない`);
      ok((await m.evaluate(() => location.hash)) === before, `${f}: タップでページが移動した`);
      const box = await m.$eval(".ref-pop", (e) => [e.getBoundingClientRect().left, e.getBoundingClientRect().right]).catch(() => [0, 9999]);
      ok(box[0] >= 0 && box[1] <= 375, `${f}: 吹き出しが画面からはみ出す`);
    }
    await ctx.close();

    // #src-n で出典一覧が開く・リンク切れの [n]
    const h = await b.newPage({ viewport: { width: 375, height: 740 } });
    await h.goto(url(f) + "#src-2");
    await h.waitForTimeout(200);
    if (await h.$("#sources")) ok(await h.$eval("#sources", (d) => d.open), `${f}: #src-2 で出典一覧が開かない`);
    ok((await h.$$eval("a.ref", (as) => as.filter((a) => !document.querySelector(a.getAttribute("href"))).length)) === 0, `${f}: 行き先のない [n]`);
    await h.close();

    // 幅320px・文字大きめ（はみ出しは FAIL、表の中だけの横スクロールは参考表示）
    for (const [w, large] of [[320, false], [375, true]]) {
      const c2 = await b.newContext({ viewport: { width: w, height: 800 } });
      if (large) await c2.addInitScript(() => { try { localStorage.setItem("rn-font", "large"); } catch (e) {} });
      const q = await c2.newPage();
      await q.goto(url(f));
      await q.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
      const r = await q.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        tables: [...document.querySelectorAll(".table-wrap")].filter((x) => x.scrollWidth > x.clientWidth + 1 && !x.classList.contains("is-wide")).length,
      }));
      ok(r.sw <= w, `${f}: 幅${w}${large ? "・文字大きめ" : ""}で横にはみ出す`);
      if (r.tables) notes.push(`${f}: 幅${w}${large ? "・文字大きめ" : ""}で表${r.tables}個が表の中で横スクロール（許容範囲か目で確認）`);
      await c2.close();
    }

    // 印刷（ダーク設定）
    const c3 = await b.newContext({ colorScheme: "dark" });
    const pr = await c3.newPage();
    await pr.goto(url(f));
    await pr.emulateMedia({ media: "print" });
    const color = await pr.evaluate(() => getComputedStyle(document.body).color);
    ok(color === "rgb(31, 35, 40)", `${f}: 印刷時の文字色が ${color}`);
    await c3.close();
    console.log("checked", f);
  }

  // トップページ
  const ip = await b.newPage({ viewport: { width: 375, height: 800 } });
  const errs = [];
  ip.on("pageerror", (e) => errs.push(e.message));
  await ip.goto(url("index.html"));
  // 新着記事（.latest-list）は一覧の複製なので数えない
  const total = await ip.$$eval("ul.article-list:not(.latest-list) > li > .article-card", (a) => a.length);
  ok((await ip.$$eval("ul.article-list:not(.latest-list) .article-card-thumb", (t) => t.length)) === total, "index: サムネイルのない記事カードがある（tools/make_thumbs.py）");
  ok((await ip.textContent(".article-count")).includes(`全${total}件`), "index: 記事数の表示が違う");
  ok((await ip.$$eval(".category-chips .chip", (c) => c.length)) === (await ip.$$eval("h3.article-group-title", (h) => h.length)) + 1, "index: カテゴリのボタンの数が違う");
  await ip.fill("#article-search", "zzzz-no-hit");
  await ip.waitForTimeout(100);
  ok(await ip.isVisible(".search-empty"), "index: 該当なしの表示が出ない");
  ok(errs.length === 0, "index: JSエラー " + errs);
  ok((await ip.evaluate(() => document.documentElement.scrollWidth)) <= 375, "index: 横にはみ出す");
  console.log("checked index.html（" + total + "件）");

  await b.close();
  notes.forEach((n) => console.log("  NOTE", n));
  console.log(fail ? `${fail} FAILURES` : "ALL OK");
  process.exit(fail ? 1 : 0);
})();
