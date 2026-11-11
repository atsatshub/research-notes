/*
  サイト共通スクリプト（ライブラリなし・外部送信なし）
  <head> で defer なしで読み込む（表示設定をちらつきなく反映するため）。
  1. 表示設定（文字サイズ・配色）を、この端末のブラウザに保存して反映する
  2. ヘッダーに「メニュー」ボタンを追加する（この記事の目次・記事を探す・カテゴリ・ページ・表示設定）
  3. 記事ページ: 読了の目安、調査日からの経過、読み進み具合のバー、共有ボタン、
     トップへ戻るボタン、印刷時に折りたたみをすべて開く、
     広い画面では本文の横に目次を出し、いま読んでいる章に印を付ける（メニューの目次にも）、
     記事の最後に「関連する記事」を出す（assets/related.json の4件を index.html から取り込む。
     読めないときは同じカテゴリの記事。サムネイルの写真の出典も添える）
  4. トップページ: 記事の検索（空白で区切ると、すべてを含む記事）・カテゴリ絞り込み、
     新着記事、カテゴリごとの「残りを表示」、調査日からの経過。
     検索は、カードの題名・説明に加えて、記事の中の見出し・要点まで探す
     （assets/search-index.json を、検索欄を使うときに読む。一致した章へのリンクをカードの下に出す）。
     並び順は「カテゴリ別」と「新しい順」を切り替えられる。「おまかせで1本読む」は記事を1本選んで開く。
     記事カードの題名は「：」の前後で分け、後ろを小さく表示する。
     検索語・カテゴリ・並び順は URL（?q=…&cat=…&sort=new）に残すので、共有や「戻る」で同じ状態に戻れる
  assets/search-index.json と assets/related.json は tools/make_data.py が作る
*/
(function () {
  "use strict";

  var KEY_THEME = "rn-theme";
  var KEY_FONT = "rn-font";
  var root = document.documentElement;

  function load(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function save(key, value) {
    try {
      if (value) window.localStorage.setItem(key, value);
      else window.localStorage.removeItem(key);
    } catch (e) {
      /* 保存できない環境では、その場だけ反映する */
    }
  }

  function applyTheme(value) {
    if (value === "light" || value === "dark") root.setAttribute("data-theme", value);
    else root.removeAttribute("data-theme");
  }

  function applyFont(value) {
    if (value === "large") root.setAttribute("data-font", "large");
    else root.removeAttribute("data-font");
  }

  applyTheme(load(KEY_THEME));
  applyFont(load(KEY_FONT));

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      node.setAttribute(k, attrs[k]);
    });
    if (text) node.textContent = text;
    return node;
  }

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- 調査日からの経過 ----------
  function daysSince(iso) {
    var then = new Date(iso + "T00:00:00+09:00").getTime();
    if (isNaN(then)) return null;
    return Math.max(0, Math.floor((Date.now() - then) / 86400000));
  }

  function agoText(days) {
    if (days === null) return "";
    if (days < 1) return "今日";
    if (days < 31) return days + "日前";
    if (days < 365) return Math.floor(days / 30) + "か月前";
    return Math.floor(days / 365) + "年以上前";
  }

  function addAgo(timeEl) {
    var iso = timeEl.getAttribute("datetime");
    var text = agoText(daysSince(iso));
    if (!text || (timeEl.nextSibling && timeEl.nextSibling.className === "ago")) return;
    timeEl.insertAdjacentElement("afterend", el("span", { class: "ago" }, "（" + text + "）"));
  }

  // ---------- 記事一覧（index.html）の読み取り ----------
  // カテゴリ名は見出しから「（全8回）」などの補足を除いたもの
  function categoryName(h) {
    var c = h.cloneNode(true);
    // site.js が見出しに足した件数（.group-count）は名前に含めない
    Array.prototype.forEach.call(c.querySelectorAll(".group-count"), function (n) {
      n.remove();
    });
    return c.textContent.replace(/（.*?）/g, "").trim();
  }

  // 見出し（h3.article-group-title）と、その下の記事リストを組にして返す
  function readGroups(doc) {
    var groups = [];
    Array.prototype.forEach.call(doc.querySelectorAll("h3.article-group-title"), function (h) {
      var parts = [h];
      var list = null;
      for (var n = h.nextElementSibling; n && !n.matches("h3.article-group-title"); n = n.nextElementSibling) {
        parts.push(n);
        if (n.matches("ul.article-list")) {
          list = n;
          break;
        }
      }
      if (!list) return;
      var items = Array.prototype.filter.call(list.children, function (c) {
        return c.tagName === "LI";
      });
      groups.push({ name: categoryName(h), icon: h.getAttribute("data-icon") || "", heading: h, list: list, parts: parts, lis: items });
    });
    return groups;
  }

  // 記事カードの題名を「：」（または「？ 」）の前後で分け、後ろを .article-card-sub にする
  // （例: 「健康診断の結果の見方」＋「数値の意味と再検査の目安…」。前半だけで何の記事か分かるように）
  function splitTitles(rootEl) {
    Array.prototype.forEach.call(rootEl.querySelectorAll(".article-card-title"), function (t) {
      if (t.children.length) return;
      var m = t.textContent.match(/^(.+?)(：|？\s+)(.+)$/);
      if (!m) return;
      var doc = t.ownerDocument || document;
      t.textContent = m[2] === "：" ? m[1] : m[1] + "？";
      t.appendChild(doc.createTextNode(" "));
      var sub = doc.createElement("span");
      sub.className = "article-card-sub";
      sub.textContent = m[3];
      t.appendChild(sub);
    });
  }

  // 新しい順（追加順の通し番号 data-seq が大きい順。なければ調査日の新しい順）
  function newestFirst(lis) {
    return lis
      .map(function (li, i) {
        var t = li.querySelector(".article-card-date time[datetime]");
        return { li: li, i: i, seq: parseInt(li.getAttribute("data-seq"), 10) || 0, date: t ? t.getAttribute("datetime") : "" };
      })
      .sort(function (a, b) {
        if (a.seq !== b.seq) return b.seq - a.seq;
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.i - b.i;
      })
      .map(function (x) {
        return x.li;
      });
  }

  // ---------- 記事一覧の読み込み（メニューと「同じカテゴリの記事」で共用） ----------
  // サイトの基準の場所（トップなら ""、記事なら "../"）。ヘッダーのロゴのリンクから求める
  function siteBase() {
    var home = document.querySelector(".site-title");
    var href = home ? home.getAttribute("href") || "" : "";
    return href.replace(/index\.html$/, "");
  }

  var indexPromise = null;
  // index.html のカテゴリと記事を { groups, doc } で返す
  // （トップではその場の内容、ほかのページでは読み込む。読み込みは1回だけ）
  function loadIndex() {
    if (indexPromise) return indexPromise;
    if (document.querySelector(".article-search-box")) {
      indexPromise = Promise.resolve({ groups: readGroups(document), doc: document });
    } else if (!window.fetch || !window.DOMParser || !/^https?:$/.test(location.protocol)) {
      indexPromise = Promise.reject(new Error("index を読めない環境"));
    } else {
      indexPromise = fetch(siteBase() + "index.html")
        .then(function (res) {
          return res.ok ? res.text() : Promise.reject(new Error("index を読めない"));
        })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, "text/html");
          return { groups: readGroups(doc), doc: doc };
        });
    }
    return indexPromise;
  }

  // 記事カードのファイル名から「.html」を除いたもの（例: articles/data-center.html → data-center）
  function slugOf(li) {
    var a = li.querySelector("a.article-card");
    return a ? (a.getAttribute("href") || "").split("/").pop().replace(/\.html$/, "") : "";
  }

  // カードの調査日の行に、カテゴリ名を添える（カテゴリの見出しがない並び＝新しい順・関連する記事で見せる）
  function addCatLabel(li, name) {
    var date = li.querySelector(".article-card-date");
    if (!date || !name || date.querySelector(".card-cat")) return;
    var doc = li.ownerDocument || document;
    var span = doc.createElement("span");
    span.className = "card-cat";
    span.textContent = name;
    date.insertBefore(span, date.firstChild);
  }

  // 関連する記事（tools/make_data.py が、本文の言葉の近さで記事ごとに選んだもの）。読めないときは空
  var relatedPromise = null;
  function loadRelated() {
    if (relatedPromise) return relatedPromise;
    if (!window.fetch || !/^https?:$/.test(location.protocol)) {
      relatedPromise = Promise.resolve({});
    } else {
      relatedPromise = fetch(siteBase() + "assets/related.json")
        .then(function (res) {
          return res.ok ? res.json() : {};
        })
        .catch(function () {
          return {};
        });
    }
    return relatedPromise;
  }

  // トップページの検索・絞り込みを外から動かす窓口（setupIndex が入れる）
  var indexApi = null;

  // ---------- メニュー（目次・記事を探す・カテゴリ・ページ・表示設定） ----------
  function setupMenu() {
    var header = document.querySelector(".site-header .container");
    if (!header) return;
    var nav = header.querySelector(".site-nav");
    if (!nav) {
      nav = el("nav", { class: "site-nav", "aria-label": "サイト内" });
      header.appendChild(nav);
    }
    var base = siteBase();

    // いま開いているページのリンクに印を付ける
    Array.prototype.forEach.call(nav.querySelectorAll("a.nav-link"), function (a) {
      if (a.pathname === location.pathname || (a.pathname.replace(/index\.html$/, "") === location.pathname.replace(/index\.html$/, ""))) {
        a.setAttribute("aria-current", "page");
      }
    });

    var btn = el("button", { type: "button", class: "tools-btn menu-btn", "aria-expanded": "false", "aria-controls": "site-menu" });
    var icon = el("span", { class: "menu-icon", "aria-hidden": "true" });
    icon.appendChild(el("span"));
    icon.appendChild(el("span"));
    icon.appendChild(el("span"));
    var btnLabel = el("span", { class: "menu-btn-label" }, "メニュー");
    btn.appendChild(icon);
    btn.appendChild(btnLabel);

    var panel = el("div", { class: "tools-panel menu-panel", id: "site-menu", role: "dialog", "aria-label": "メニュー", tabindex: "-1", hidden: "" });
    var scrim = el("div", { class: "menu-scrim", hidden: "" });

    function section(title) {
      var s = el("section", { class: "menu-section" });
      s.appendChild(el("h2", { class: "menu-title" }, title));
      panel.appendChild(s);
      return s;
    }

    function open(state) {
      panel.hidden = !state;
      scrim.hidden = !state;
      btn.setAttribute("aria-expanded", state ? "true" : "false");
      btnLabel.textContent = state ? "閉じる" : "メニュー";
      btn.classList.toggle("is-open", state);
      if (state) fillCategories();
    }

    // 1. この記事の目次（記事ページだけ）
    var toc = document.querySelector("main article .toc ol");
    if (toc) {
      var tocSec = section("この記事の目次");
      var tocList = el("ol", { class: "menu-list menu-toc" });
      Array.prototype.forEach.call(toc.querySelectorAll("a[href^='#']"), function (a) {
        var li = el("li");
        var link = el("a", { href: a.getAttribute("href") }, a.textContent);
        link.addEventListener("click", function () {
          open(false);
        });
        li.appendChild(link);
        tocList.appendChild(li);
      });
      tocSec.appendChild(tocList);
    }

    // 2. 記事を探す（トップページの検索へ。トップではその場で絞り込む）
    var findSec = section("記事を探す");
    var form = el("form", { class: "search-form menu-search", action: base + "index.html", method: "get", role: "search" });
    var q = el("input", { type: "search", name: "q", class: "search-input", placeholder: "キーワード", "aria-label": "キーワードで記事を探す", autocomplete: "off" });
    form.appendChild(q);
    form.appendChild(el("button", { type: "submit" }, "探す"));
    form.addEventListener("submit", function (e) {
      if (!indexApi) return;
      e.preventDefault();
      open(false);
      indexApi.search(q.value);
    });
    findSec.appendChild(form);
    // おまかせ: いまのページ以外から1本選んで開く
    var lucky = el("button", { type: "button", class: "random-btn menu-random" }, "おまかせで1本読む");
    lucky.addEventListener("click", function () {
      loadIndex()
        .then(function (index) {
          var here = location.pathname.split("/").pop().replace(/\.html$/, "");
          var links = [];
          index.groups.forEach(function (g) {
            g.lis.forEach(function (li) {
              var a = li.querySelector("a.article-card");
              if (a && slugOf(li) !== here) links.push(a.getAttribute("href"));
            });
          });
          if (links.length) location.href = base + links[Math.floor(Math.random() * links.length)];
        })
        .catch(function () {
          location.href = base + "index.html";
        });
    });
    findSec.appendChild(lucky);

    // 3. カテゴリ（開いたときに一度だけ作る）
    var catSec = section("カテゴリから探す");
    var catList = el("ul", { class: "menu-list menu-cats" });
    catSec.appendChild(catList);
    var catsFilled = false;
    function fillCategories() {
      if (catsFilled) return;
      catsFilled = true;
      loadIndex()
        .then(function (index) {
          index.groups.forEach(function (g) {
            var li = el("li");
            var a = el("a", { href: base + "index.html?cat=" + encodeURIComponent(g.name) });
            if (g.icon) a.appendChild(el("span", { class: "menu-cat-icon", "data-icon": g.icon, "aria-hidden": "true" }));
            a.appendChild(el("span", { class: "menu-cat-name" }, g.name));
            a.appendChild(el("span", { class: "chip-count" }, String(g.lis.length)));
            a.addEventListener("click", function (e) {
              if (!indexApi) return;
              e.preventDefault();
              open(false);
              indexApi.category(g.name);
            });
            li.appendChild(a);
            catList.appendChild(li);
          });
        })
        .catch(function () {
          var li = el("li");
          li.appendChild(el("a", { href: base + "index.html" }, "記事一覧で探す"));
          catList.appendChild(li);
        });
    }

    // 4. ページ（フッターのリンクと同じもの）
    var pageSec = section("ページ");
    var pageList = el("ul", { class: "menu-list menu-pages" });
    Array.prototype.forEach.call(document.querySelectorAll(".site-footer .footer-nav a"), function (a) {
      var li = el("li");
      li.appendChild(a.cloneNode(true));
      pageList.appendChild(li);
    });
    pageSec.appendChild(pageList);

    // 5. 表示設定
    function group(title, name, options, current, onChange) {
      var fs = el("fieldset", { class: "tools-group" });
      fs.appendChild(el("legend", {}, title));
      options.forEach(function (opt) {
        var label = el("label", { class: "tools-option" });
        var input = el("input", { type: "radio", name: name, value: opt[0] });
        if (opt[0] === current) input.checked = true;
        input.addEventListener("change", function () {
          onChange(opt[0]);
        });
        label.appendChild(input);
        label.appendChild(document.createTextNode(opt[1]));
        fs.appendChild(label);
      });
      return fs;
    }

    var viewSec = section("表示設定");
    viewSec.id = "display-settings";
    viewSec.appendChild(group("文字の大きさ", "rn-font", [["", "標準"], ["large", "大きめ"]], load(KEY_FONT) || "", function (v) {
      applyFont(v);
      save(KEY_FONT, v);
    }));
    viewSec.appendChild(group("配色", "rn-theme", [["", "自動（端末の設定）"], ["light", "ライト"], ["dark", "ダーク"]], load(KEY_THEME) || "", function (v) {
      applyTheme(v);
      save(KEY_THEME, v);
    }));
    viewSec.appendChild(el("p", { class: "tools-note" }, "設定はこの端末のブラウザにだけ保存されます。"));

    btn.addEventListener("click", function () {
      open(panel.hidden);
      if (!panel.hidden) panel.focus();
    });
    scrim.addEventListener("click", function () {
      open(false);
    });
    document.addEventListener("click", function (e) {
      if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) open(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) {
        open(false);
        btn.focus();
      }
    });

    nav.appendChild(btn);
    header.appendChild(panel);
    document.body.appendChild(scrim);
  }

  // ---------- 記事ページ ----------
  // 記事の最後に、関連する記事を出す
  // （内容の近い4件。データを読めないときは同じカテゴリのほかの記事、それもなければ新着の記事）
  function setupMoreArticles(article) {
    var self = location.pathname.split("/").pop().replace(/\.html$/, "");
    if (!self) return;
    Promise.all([loadIndex(), loadRelated()])
      .then(function (both) {
        var index = both[0];
        var related = both[1] || {};
        var groups = index.groups;
        var isSelf = function (li) {
          return slugOf(li) === self;
        };
        var mine = null;
        var bySlug = {};
        var catOf = {};
        groups.forEach(function (g) {
          g.lis.forEach(function (li) {
            bySlug[slugOf(li)] = li;
            catOf[slugOf(li)] = g.name;
          });
          if (g.lis.some(isSelf)) mine = g;
        });
        // 内容の近い記事（一覧にあるものだけ）
        var picks = (related[self] || [])
          .map(function (slug) {
            return bySlug[slug];
          })
          .filter(function (li) {
            return li && !isSelf(li);
          });
        var others = mine
          ? mine.lis.filter(function (li) {
              return !isSelf(li);
            })
          : [];
        var title;
        var more = null;
        if (picks.length >= 2) {
          others = picks;
          title = "関連する記事";
          more = mine
            ? el("a", { class: "more-link", href: "../index.html?cat=" + encodeURIComponent(mine.name) }, "「" + mine.name + "」の記事一覧（" + mine.lis.length + "件）")
            : el("a", { class: "more-link", href: "../index.html" }, "記事一覧へ");
        } else if (mine && others.length) {
          title = "「" + mine.name + "」のほかの記事";
          more = el("a", { class: "more-link", href: "../index.html?cat=" + encodeURIComponent(mine.name) }, "すべて見る（" + mine.lis.length + "件）");
        } else {
          // 同じカテゴリにほかの記事がないときは、サイト全体の新着を出す
          var all = [];
          groups.forEach(function (g) {
            all = all.concat(g.lis);
          });
          others = newestFirst(all).filter(function (li) {
            return !isSelf(li);
          });
          title = "新着の記事";
          more = el("a", { class: "more-link", href: "../index.html" }, "記事一覧へ");
        }
        if (!others.length) return;

        var section = el("section", { class: "more-articles", "aria-label": title });
        var head = el("div", { class: "section-head" });
        head.appendChild(el("h2", {}, title));
        head.appendChild(more);
        var list = el("ul", { class: "article-list" });
        var credits = [];
        others.slice(0, 4).forEach(function (li) {
          // 読み込んだ index.html の中で複製し、リンクと画像の場所を直してから、このページに移す
          // （直す前の場所の画像を読みに行かないように）
          var src = li.cloneNode(true);
          var a = src.querySelector("a.article-card");
          // index.html から見た「articles/xxx.html」を、記事ページから見た「xxx.html」に直す
          var name = a.getAttribute("href").split("/").pop();
          a.setAttribute("href", name);
          Array.prototype.forEach.call(src.querySelectorAll(".article-card-thumb img[src]"), function (img) {
            img.setAttribute("src", img.getAttribute("src").replace(/^articles\//, ""));
            // サムネイルの写真の出典（index.html の末尾の「写真の出典」の行）を添える
            var credit = index.doc.getElementById("credit-" + name.replace(/\.html$/, ""));
            if (credit) credits.push(credit);
          });
          var copy = document.importNode(src, true);
          splitTitles(copy);
          Array.prototype.forEach.call(copy.querySelectorAll(".article-card-date time[datetime]"), addAgo);
          // ほかのカテゴリの記事も混ざるので、カテゴリ名を添える
          addCatLabel(copy, catOf[name.replace(/\.html$/, "")]);
          list.appendChild(copy);
        });
        section.appendChild(head);
        section.appendChild(list);
        if (credits.length) {
          var box = el("details", { class: "sources-box more-credits" });
          box.appendChild(el("summary", {}, "これらの記事の写真の出典（" + credits.length + "件）"));
          var ol = el("ol", { class: "sources" });
          credits.forEach(function (c) {
            var item = document.importNode(c, true);
            item.removeAttribute("id");
            Array.prototype.forEach.call(item.querySelectorAll("a[href^='articles/']"), function (x) {
              x.setAttribute("href", x.getAttribute("href").replace(/^articles\//, ""));
            });
            ol.appendChild(item);
          });
          box.appendChild(ol);
          section.appendChild(box);
        }
        article.insertAdjacentElement("afterend", section);
      })
      .catch(function () {
        /* 読めないときは何も出さない（フッターの「記事一覧」から戻れる） */
      });
  }

  function setupArticle(article) {
    var meta = article.querySelector(".article-meta");

    // 調査日・更新日からの経過
    if (meta) Array.prototype.forEach.call(meta.querySelectorAll("time[datetime]"), addAgo);

    // 読了の目安（出典・目次・免責などを除いた本文の文字数から。1分あたり500字で計算）
    if (meta) {
      var clone = article.cloneNode(true);
      Array.prototype.forEach.call(clone.querySelectorAll(".sources-box, .toc, .series-nav, .disclaimer, .breadcrumb, .article-meta, script"), function (n) {
        n.remove();
      });
      var chars = (clone.textContent || "").replace(/\s+/g, "").length;
      var minutes = Math.max(1, Math.round(chars / 500));
      var li = el("li", { class: "meta-read" }, "読了の目安: 約" + minutes + "分（くわしくを含む）");
      meta.appendChild(li);
    }

    // 共有・リンクのコピー
    if (meta) {
      var share = el("button", { type: "button", class: "share-btn" }, navigator.share ? "この記事を共有" : "リンクをコピー");
      var status = el("span", { class: "share-status", role: "status", "aria-live": "polite" });
      share.addEventListener("click", function () {
        var url = location.href.split("#")[0];
        var title = document.title;
        if (navigator.share) {
          navigator.share({ title: title, url: url }).catch(function () {});
          return;
        }
        var done = function () {
          status.textContent = "コピーしました";
          setTimeout(function () {
            status.textContent = "";
          }, 2500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, function () {
            status.textContent = url;
          });
        } else {
          status.textContent = url;
        }
      });
      var wrap = el("div", { class: "share-row" });
      wrap.appendChild(share);
      wrap.appendChild(status);
      meta.insertAdjacentElement("afterend", wrap);
    }

    // 同じカテゴリの記事（読了の目安を数えた後に足す）
    setupMoreArticles(article);

    // 横の目次（広い画面だけ。本文の目次が画面の外に出たら現れる）と、いま読んでいる章の印
    // 本文とメニューに同じ目次があるので、読み上げとキーボードの移動先からは外す（マウスで使う近道）
    var tocBox = article.querySelector(".toc");
    var spy = [];
    var spyCurrent = -1;
    var sideToc = null;
    if (tocBox) {
      sideToc = el("nav", { class: "side-toc", "aria-hidden": "true" });
      sideToc.appendChild(el("p", { class: "side-toc-title" }, "目次"));
      var sideList = el("ol");
      Array.prototype.forEach.call(tocBox.querySelectorAll("ol a[href^='#']"), function (a) {
        var id = a.getAttribute("href").slice(1);
        var target = id ? document.getElementById(id) : null;
        if (!target) return;
        var link = el("a", { href: "#" + id, tabindex: "-1" }, a.textContent);
        var item = el("li");
        item.appendChild(link);
        sideList.appendChild(item);
        var links = [link];
        Array.prototype.forEach.call(document.querySelectorAll(".menu-toc a"), function (m) {
          if (m.getAttribute("href") === "#" + id) links.push(m);
        });
        spy.push({ target: target, links: links });
      });
      sideToc.appendChild(sideList);
      document.body.appendChild(sideToc);
    }

    // 読み進み具合のバー
    var bar = el("div", { class: "read-progress", "aria-hidden": "true" });
    document.body.appendChild(bar);

    // トップへ戻る
    var toTop = el("button", { type: "button", class: "to-top", "aria-label": "ページの先頭へ戻る", hidden: "" }, "↑");
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      var h1 = document.querySelector("h1");
      if (h1) {
        h1.setAttribute("tabindex", "-1");
        h1.focus({ preventScroll: true });
      }
    });
    document.body.appendChild(toTop);

    var ticking = false;
    function update() {
      ticking = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      bar.style.transform = "scaleX(" + ratio + ")";
      toTop.hidden = window.scrollY < 800;
      if (sideToc) {
        // いま読んでいる章 = 見出しが画面の上（固定ヘッダーのすぐ下）を過ぎた、いちばん後ろの章
        var current = -1;
        for (var i = 0; i < spy.length; i++) {
          if (spy[i].target.getBoundingClientRect().top <= 96) current = i;
        }
        if (current !== spyCurrent) {
          spy.forEach(function (s, n) {
            s.links.forEach(function (l) {
              l.classList.toggle("is-current", n === current);
            });
          });
          spyCurrent = current;
        }
        sideToc.classList.toggle("is-visible", tocBox.getBoundingClientRect().bottom < 56);
      }
    }
    window.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });
    window.addEventListener("resize", update);
    update();

    // 印刷時は折りたたみをすべて開く（印刷後に元へ戻す）
    var closed = [];
    window.addEventListener("beforeprint", function () {
      closed = Array.prototype.filter.call(document.querySelectorAll("details"), function (d) {
        return !d.open;
      });
      closed.forEach(function (d) {
        d.open = true;
      });
    });
    window.addEventListener("afterprint", function () {
      closed.forEach(function (d) {
        d.open = false;
      });
      closed = [];
    });
  }

  // ---------- トップページ ----------
  function normalize(s) {
    return (s || "")
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
      })
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  // 検索語を空白（全角を含む）で区切る。すべての語を含む記事だけを出す
  function searchTerms(value) {
    return (value || "")
      .split(/[\s　]+/)
      .map(normalize)
      .filter(function (t) {
        return t;
      });
  }

  var PER_CATEGORY = 4; // カテゴリごとに最初に見せる件数（これより2件以上多いときだけ、残りをたたむ）
  var LATEST_COUNT = 6; // 新着記事の件数（パソコンは3列×2段、スマホは横に送る列）
  var FLAT_PAGE = 24; // 「新しい順」で最初に見せる件数（「さらに表示」でこの数ずつ増やす）
  // まとめる前のカテゴリ名（共有・ブックマークされた ?cat= のURLを、いまのカテゴリで開くため）
  var OLD_CATEGORY = {
    "お金・投資": "お金・税金",
    "税金・お金の手続き": "お金・税金",
    "資格試験": "資格・語学",
    "英語学習": "資格・語学",
    "クルマ": "暮らし・健康",
    "BIM・建設ソフト": "仕事・学習の道具",
    "おでかけ・見学": "おでかけ・旅行",
    "旅行・きっぷ": "おでかけ・旅行"
  };

  function setupIndex(box) {
    Array.prototype.forEach.call(document.querySelectorAll(".article-card-date time[datetime]"), addAgo);
    splitTitles(document);

    var input = box.querySelector("#article-search");
    var chipsWrap = box.querySelector(".category-chips");
    var count = box.querySelector(".article-count");
    var empty = document.querySelector(".search-empty");

    var groups = readGroups(document).map(function (g) {
      g.items = g.lis.map(function (li) {
        return {
          li: li,
          group: g,
          slug: slugOf(li),
          text: normalize(li.textContent + " " + g.heading.textContent),
          deep: null, // 記事の中の見出し・要点（検索用データを読んだあとに入る）
          hits: null, // 一致した章へのリンク（検索中だけ、カードの下に出す）
          hitsKey: ""
        };
      });
      g.expanded = false;
      g.moreBtn = null;
      // カテゴリの見出しに件数を添える
      g.heading.appendChild(el("span", { class: "group-count" }, g.items.length + "件"));
      // 件数が多いカテゴリには「残りN件を表示」ボタンを足す
      if (g.items.length > PER_CATEGORY + 1) {
        var wrap = el("p", { class: "more-row" });
        var btn = el("button", { type: "button", class: "more-btn" }, "「" + g.name + "」の残り" + (g.items.length - PER_CATEGORY) + "件を表示");
        btn.addEventListener("click", function () {
          g.expanded = true;
          render();
          var next = g.items[PER_CATEGORY].li.querySelector("a");
          if (next) next.focus();
        });
        wrap.appendChild(btn);
        g.list.insertAdjacentElement("afterend", wrap);
        g.moreBtn = wrap;
      }
      return g;
    });

    // すべての記事（一覧に書いてある順）と、新しい順に並べたもの
    var allItems = [];
    groups.forEach(function (g) {
      allItems = allItems.concat(g.items);
    });
    var allLis = allItems.map(function (it) {
      return it.li;
    });
    var byNewest = newestFirst(allLis).map(function (li) {
      return allItems[allLis.indexOf(li)];
    });
    var total = allItems.length;

    // 「カテゴリ別の記事一覧」の見出し（並び順が「新しい順」のときは書き換える）
    var major = document.getElementById("categories");
    var majorTitle = major ? major.querySelector("h2") : null;
    var majorTitleText = majorTitle ? majorTitle.textContent : "";
    var catNote = document.querySelector(".categories-note");

    // URL（?q=…&cat=…&sort=new）から状態を読む
    function readUrl() {
      var p;
      try {
        p = new URLSearchParams(location.search);
      } catch (e) {
        return { q: "", cat: "", view: "" };
      }
      var cat = p.get("cat") || "";
      if (OLD_CATEGORY.hasOwnProperty(cat)) cat = OLD_CATEGORY[cat];
      var known = groups.some(function (g) {
        return g.name === cat;
      });
      return { q: p.get("q") || "", cat: known ? cat : "", view: major && p.get("sort") === "new" ? "new" : "" };
    }

    function writeUrl(q, cat, sort) {
      if (!window.history || !history.replaceState || !/^https?:$/.test(location.protocol)) return;
      var p = [];
      if (q) p.push("q=" + encodeURIComponent(q));
      if (cat) p.push("cat=" + encodeURIComponent(cat));
      if (sort) p.push("sort=" + encodeURIComponent(sort));
      var url = location.pathname + (p.length ? "?" + p.join("&") : "") + location.hash;
      if (url !== location.pathname + location.search + location.hash) history.replaceState(null, "", url);
    }

    var state = readUrl();
    var active = state.cat;
    var view = state.view; // "" = カテゴリ別、"new" = 新しい順
    var flatLimit = FLAT_PAGE;
    input.value = state.q;

    // 新着: 全カテゴリの記事を新しい順に並べ、上位を複製して「新着記事」に入れる（カテゴリ名を添える）
    var latest = document.querySelector(".latest");
    var latestList = latest ? latest.querySelector(".latest-list") : null;
    var hasLatest = false;
    if (latestList) {
      byNewest.slice(0, LATEST_COUNT).forEach(function (it) {
        var copy = it.li.cloneNode(true);
        copy.hidden = false;
        var card = copy.querySelector("a.article-card");
        if (card) {
          var thumb = card.querySelector(".article-card-thumb");
          card.insertBefore(el("span", { class: "article-card-cat" }, it.group.name), thumb ? thumb.nextSibling : card.firstChild);
        }
        latestList.appendChild(copy);
      });
      hasLatest = total > 0;
      latest.hidden = !hasLatest;
      // 新着に入りきらない記事も、新しい順にたどれるようにする
      if (major && total > LATEST_COUNT) {
        var moreNew = el("p", { class: "latest-more" });
        var moreNewBtn = el("button", { type: "button", class: "text-btn" }, "新しい順にすべて見る（全" + total + "件）");
        moreNewBtn.addEventListener("click", function () {
          setView("new");
          major.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
        });
        moreNew.appendChild(moreNewBtn);
        latest.appendChild(moreNew);
      }
    }

    // カテゴリの見出しがない並び（新しい順）で見せるカテゴリ名（新着の複製を作ったあとに足す）
    allItems.forEach(function (it) {
      addCatLabel(it.li, it.group.name);
    });

    // 並び順の切り替え（カテゴリ別／新しい順）と、新しい順のときに使う一覧
    var switchWrap = el("div", { class: "view-switch", role: "group", "aria-label": "並び順" });
    switchWrap.appendChild(el("span", { class: "view-switch-label", "aria-hidden": "true" }, "並び順"));
    [["", "カテゴリ別"], ["new", "新しい順"]].forEach(function (v) {
      var b = el("button", { type: "button", class: "view-btn", "data-view": v[0], "aria-pressed": v[0] === view ? "true" : "false" }, v[1]);
      b.addEventListener("click", function () {
        setView(v[0]);
      });
      switchWrap.appendChild(b);
    });
    var flatList = el("ul", { class: "article-list flat-list", hidden: "" });
    var flatMore = el("p", { class: "more-row", hidden: "" });
    var flatMoreBtn = el("button", { type: "button", class: "more-btn" });
    flatMoreBtn.addEventListener("click", function () {
      var first = byNewest[flatLimit];
      flatLimit += FLAT_PAGE;
      render();
      var next = first ? first.li.querySelector("a") : null;
      if (next) next.focus();
    });
    flatMore.appendChild(flatMoreBtn);
    if (major) {
      major.insertAdjacentElement("afterend", switchWrap);
      switchWrap.insertAdjacentElement("afterend", flatList);
      flatList.insertAdjacentElement("afterend", flatMore);
    }

    // 記事カードを、並び順に合った場所へ移す（新しい順: ひとつの一覧へ。カテゴリ別: 元のカテゴリへ、元の順で）
    function placeItems() {
      if (view === "new") {
        byNewest.forEach(function (it) {
          flatList.appendChild(it.li);
        });
      } else {
        allItems.forEach(function (it) {
          it.group.list.appendChild(it.li);
        });
      }
    }

    // 検索用データ（記事の中の見出し・要点）。検索欄を使うときに一度だけ読む。
    // 読めないときは、これまでどおりカードの題名・説明だけで探す
    var deepState = ""; // "" → "loading" → "ready"（読めなければ "failed"）
    function loadDeep() {
      if (deepState || !window.fetch || !/^https?:$/.test(location.protocol)) return;
      deepState = "loading";
      fetch("assets/search-index.json")
        .then(function (res) {
          return res.ok ? res.json() : Promise.reject(new Error("検索用データを読めない"));
        })
        .then(function (data) {
          allItems.forEach(function (it) {
            var d = data[it.slug];
            if (!d) return;
            var secs = (d.s || []).map(function (s) {
              var heads = s[2] || [];
              return {
                id: s[0],
                title: s[1],
                titleText: normalize(s[1]),
                heads: heads.map(function (h) {
                  return { label: h, text: normalize(h) };
                }),
                text: normalize(s[1] + " " + heads.join(" ") + " " + (s[3] || ""))
              };
            });
            var texts = secs.map(function (s) {
              return s.text;
            });
            it.deep = { secs: secs, text: normalize(d.p || "") + " " + texts.join(" ") };
          });
          deepState = "ready";
          render();
        })
        .catch(function () {
          deepState = "failed";
        });
    }

    // カテゴリの絞り込みと、検索語（すべての語を、カードか記事の中の見出し・要点に含む）に合うか
    function matches(it, terms) {
      if (active && it.group.name !== active) return false;
      return terms.every(function (t) {
        return it.text.indexOf(t) !== -1 || (!!it.deep && it.deep.text.indexOf(t) !== -1);
      });
    }

    // 検索語に一致した章へのリンクを、カードの下に3件まで出す（移動先は章の先頭）
    function updateHits(it, terms) {
      var found = [];
      if (terms.length && it.deep) {
        it.deep.secs.forEach(function (s, order) {
          var n = terms.filter(function (t) {
            return s.text.indexOf(t) !== -1;
          }).length;
          if (n) found.push({ s: s, n: n, order: order });
        });
        // いちばん多くの語に一致した章だけを、記事の中の順に3件まで出す
        // （2語で探したとき、片方の語しかない章を並べないように）
        var best = found.reduce(function (m, f) {
          return Math.max(m, f.n);
        }, 0);
        found = found
          .filter(function (f) {
            return f.n === best;
          })
          .slice(0, 3);
      }
      var ids = found.map(function (f) {
        return f.s.id;
      });
      var key = found.length ? terms.join(" ") + "|" + ids.join(",") : "";
      if (it.hitsKey === key) return;
      it.hitsKey = key;
      if (it.hits) {
        it.hits.remove();
        it.hits = null;
      }
      it.li.classList.toggle("has-hits", found.length > 0);
      if (!found.length) return;
      var p = el("p", { class: "card-hits" });
      p.appendChild(el("span", { class: "card-hits-label" }, "記事の中"));
      found.forEach(function (f) {
        // 章の見出しに語がなく、小見出しにあるときは、小見出しを出す
        var label = f.s.title;
        var inTitle = terms.some(function (t) {
          return f.s.titleText.indexOf(t) !== -1;
        });
        if (!inTitle) {
          f.s.heads.some(function (h) {
            var hit = terms.some(function (t) {
              return h.text.indexOf(t) !== -1;
            });
            if (hit) label = h.label;
            return hit;
          });
        }
        p.appendChild(el("a", { href: "articles/" + it.slug + ".html#" + f.s.id }, label));
      });
      it.li.appendChild(p);
      it.hits = p;
    }

    function render() {
      var terms = searchTerms(input.value);
      var filtering = terms.length > 0 || !!active;
      var flat = view === "new";
      var shown = 0;
      // 検索・絞り込み中と「新しい順」のときは新着を隠す（同じ記事が2回出ないように）
      if (latest) latest.hidden = !hasLatest || filtering || flat;
      flatList.hidden = !flat;
      if (flat) {
        byNewest.forEach(function (it) {
          var hit = matches(it, terms);
          // 絞り込んでいないときは、最初の24件だけ出す（「さらに表示」で増やす）
          it.li.hidden = !hit || (!filtering && shown >= flatLimit);
          updateHits(it, hit ? terms : []);
          if (hit) shown++;
        });
        groups.forEach(function (g) {
          g.parts.forEach(function (p) {
            p.hidden = true;
          });
          if (g.moreBtn) g.moreBtn.hidden = true;
        });
        var rest = filtering ? 0 : total - flatLimit;
        flatMore.hidden = rest <= 0;
        if (rest > 0) flatMoreBtn.textContent = "さらに表示（残り" + rest + "件）";
      } else {
        flatMore.hidden = true;
        groups.forEach(function (g) {
          var visible = 0;
          g.items.forEach(function (it, i) {
            var hit = matches(it, terms);
            // 絞り込んでいないときは、多いカテゴリの5件目以降をたたむ
            var folded = !filtering && !g.expanded && !!g.moreBtn && i >= PER_CATEGORY;
            it.li.hidden = !hit || folded;
            updateHits(it, hit ? terms : []);
            if (hit) visible++;
          });
          g.parts.forEach(function (p) {
            p.hidden = visible === 0;
          });
          if (g.moreBtn) g.moreBtn.hidden = filtering || g.expanded || visible === 0;
          shown += visible;
        });
      }
      if (majorTitle) majorTitle.textContent = flat ? "記事一覧（新しい順）" : majorTitleText;
      if (catNote) catNote.textContent = flat ? "全" + total + "件" : groups.length + "カテゴリ・全" + total + "件";
      var deepNote = terms.length && deepState === "ready" ? "。記事の中の見出し・要点も検索" : "";
      count.textContent = filtering ? shown + "件見つかりました（全" + total + "件" + deepNote + "）" : "全" + total + "件の記事";
      if (empty) empty.hidden = shown !== 0;
      writeUrl(input.value.trim(), active, view);
    }

    function setView(value) {
      if (!major) return;
      view = value;
      flatLimit = FLAT_PAGE;
      Array.prototype.forEach.call(switchWrap.querySelectorAll(".view-btn"), function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-view") === value ? "true" : "false");
      });
      placeItems();
      render();
    }

    function setCategory(value) {
      active = value;
      Array.prototype.forEach.call(chipsWrap.querySelectorAll(".chip"), function (c) {
        c.setAttribute("aria-pressed", c.getAttribute("data-value") === value ? "true" : "false");
      });
      render();
    }

    function chip(label, value, n) {
      var b = el("button", { type: "button", class: "chip", "data-value": value, "aria-pressed": value === active ? "true" : "false" }, label);
      b.appendChild(el("span", { class: "chip-count" }, String(n)));
      b.addEventListener("click", function () {
        setCategory(value);
      });
      chipsWrap.appendChild(b);
    }

    chip("すべて", "", total);
    groups.forEach(function (g) {
      chip(g.name, g.name, g.items.length);
    });

    // 件数の右に「おまかせで1本読む」（絞り込み中は、その中から選ぶ）
    var foot = el("div", { class: "search-foot" });
    count.parentNode.insertBefore(foot, count);
    foot.appendChild(count);
    var randomBtn = el("button", { type: "button", class: "random-btn" }, "おまかせで1本読む");
    randomBtn.addEventListener("click", function () {
      var terms = searchTerms(input.value);
      var pool = allItems.filter(function (it) {
        return matches(it, terms);
      });
      if (!pool.length) pool = allItems;
      var a = pool.length ? pool[Math.floor(Math.random() * pool.length)].li.querySelector("a.article-card") : null;
      if (a) location.href = a.href;
    });
    foot.appendChild(randomBtn);

    input.addEventListener("input", render);
    // 検索用データは、検索欄に入ったとき（または打ち始めたとき）に読む
    input.addEventListener("focus", loadDeep);
    input.addEventListener("input", loadDeep);

    // 「/」キーで検索欄へ（入力中は除く）
    document.addEventListener("keydown", function (e) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      input.focus();
    });

    box.hidden = false;
    if (view) placeItems();
    render();
    // 検索語つきで開いたとき（メニューや 404 の検索から）は、すぐに記事の中まで探す
    if (state.q) loadDeep();

    // メニューから、その場で検索・絞り込みをするための窓口
    function showResults() {
      box.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    }
    indexApi = {
      search: function (text) {
        input.value = text || "";
        if (input.value) loadDeep();
        setCategory("");
        showResults();
      },
      category: function (name) {
        input.value = "";
        setCategory(name);
        showResults();
      }
    };

    // カテゴリを指定して開いたとき（記事のパンくずなどから）は、一覧の先頭が見える位置へ
    if (active && !location.hash) {
      box.scrollIntoView({ block: "start" });
    }
  }

  ready(function () {
    setupMenu();
    var article = document.querySelector("main article");
    if (article) setupArticle(article);
    var box = document.querySelector(".article-search-box");
    if (box) setupIndex(box);
  });
})();
