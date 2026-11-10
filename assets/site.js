/*
  サイト共通スクリプト（ライブラリなし・外部送信なし）
  <head> で defer なしで読み込む（表示設定をちらつきなく反映するため）。
  1. 表示設定（文字サイズ・配色）を、この端末のブラウザに保存して反映する
  2. ヘッダーに「メニュー」ボタンを追加する（この記事の目次・記事を探す・カテゴリ・ページ・表示設定）
  3. 記事ページ: 読了の目安、調査日からの経過、読み進み具合のバー、共有ボタン、
     トップへ戻るボタン、印刷時に折りたたみをすべて開く、
     記事の最後に「同じカテゴリの記事」を出す（index.html を読んで作る。サムネイルの写真の出典も添える）
  4. トップページ: 記事の検索（空白で区切ると、すべてを含む記事）・カテゴリ絞り込み、
     新着記事、カテゴリごとの「残りを表示」、調査日からの経過。
     記事カードの題名は「：」の前後で分け、後ろを小さく表示する。
     検索語とカテゴリは URL（?q=…&cat=…）に残すので、共有や「戻る」で同じ状態に戻れる
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
  // 記事の最後に、同じカテゴリのほかの記事（なければ新着の記事）を出す
  function setupMoreArticles(article) {
    var file = location.pathname.split("/").pop();
    if (!file) return;
    loadIndex()
      .then(function (index) {
        var groups = index.groups;
        var isSelf = function (li) {
          var a = li.querySelector("a.article-card");
          return !!a && a.getAttribute("href").split("/").pop() === file;
        };
        var mine = null;
        groups.forEach(function (g) {
          if (g.lis.some(isSelf)) mine = g;
        });
        var others = mine
          ? mine.lis.filter(function (li) {
              return !isSelf(li);
            })
          : [];
        var title;
        var more = null;
        if (mine && others.length) {
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
        return { li: li, text: normalize(li.textContent + " " + g.heading.textContent) };
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

    var total = groups.reduce(function (sum, g) {
      return sum + g.items.length;
    }, 0);

    // 「カテゴリ別の記事一覧」の見出しに、カテゴリ数と全体の件数を添える
    var catNote = document.querySelector(".categories-note");
    if (catNote) catNote.textContent = groups.length + "カテゴリ・全" + total + "件";

    // URL（?q=…&cat=…）から状態を読む
    function readUrl() {
      var p;
      try {
        p = new URLSearchParams(location.search);
      } catch (e) {
        return { q: "", cat: "" };
      }
      var cat = p.get("cat") || "";
      if (OLD_CATEGORY.hasOwnProperty(cat)) cat = OLD_CATEGORY[cat];
      var known = groups.some(function (g) {
        return g.name === cat;
      });
      return { q: p.get("q") || "", cat: known ? cat : "" };
    }

    function writeUrl(q, cat) {
      if (!window.history || !history.replaceState || !/^https?:$/.test(location.protocol)) return;
      var p = [];
      if (q) p.push("q=" + encodeURIComponent(q));
      if (cat) p.push("cat=" + encodeURIComponent(cat));
      var url = location.pathname + (p.length ? "?" + p.join("&") : "") + location.hash;
      if (url !== location.pathname + location.search + location.hash) history.replaceState(null, "", url);
    }

    var state = readUrl();
    var active = state.cat;
    input.value = state.q;

    // 新着: 全カテゴリの記事を新しい順に並べ、上位を複製して「新着記事」に入れる（カテゴリ名を添える）
    var latest = document.querySelector(".latest");
    var latestList = latest ? latest.querySelector(".latest-list") : null;
    var hasLatest = false;
    if (latestList) {
      var all = [];
      var catOf = [];
      groups.forEach(function (g) {
        g.lis.forEach(function (li) {
          all.push(li);
          catOf.push(g.name);
        });
      });
      newestFirst(all).slice(0, LATEST_COUNT).forEach(function (li) {
        var copy = li.cloneNode(true);
        copy.hidden = false;
        var card = copy.querySelector("a.article-card");
        if (card) {
          var thumb = card.querySelector(".article-card-thumb");
          card.insertBefore(el("span", { class: "article-card-cat" }, catOf[all.indexOf(li)]), thumb ? thumb.nextSibling : card.firstChild);
        }
        latestList.appendChild(copy);
      });
      hasLatest = all.length > 0;
      latest.hidden = !hasLatest;
    }

    function render() {
      var terms = searchTerms(input.value);
      var filtering = terms.length > 0 || !!active;
      var shown = 0;
      // 検索・絞り込み中は新着を隠す（同じ記事が2回出ないように）
      if (latest) latest.hidden = !hasLatest || filtering;
      groups.forEach(function (g) {
        var inCategory = !active || g.name === active;
        var visible = 0;
        g.items.forEach(function (it, i) {
          var hit = inCategory && terms.every(function (t) {
            return it.text.indexOf(t) !== -1;
          });
          // 絞り込んでいないときは、多いカテゴリの5件目以降をたたむ
          var folded = !filtering && !g.expanded && !!g.moreBtn && i >= PER_CATEGORY;
          it.li.hidden = !hit || folded;
          if (hit) visible++;
        });
        g.parts.forEach(function (p) {
          p.hidden = visible === 0;
        });
        if (g.moreBtn) g.moreBtn.hidden = filtering || g.expanded || visible === 0;
        shown += visible;
      });
      count.textContent = filtering ? shown + "件見つかりました（全" + total + "件）" : "全" + total + "件の記事";
      if (empty) empty.hidden = shown !== 0;
      writeUrl(input.value.trim(), active);
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

    input.addEventListener("input", render);

    // 「/」キーで検索欄へ（入力中は除く）
    document.addEventListener("keydown", function (e) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      input.focus();
    });

    box.hidden = false;
    render();

    // メニューから、その場で検索・絞り込みをするための窓口
    function showResults() {
      box.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    }
    indexApi = {
      search: function (text) {
        input.value = text || "";
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
