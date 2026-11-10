/*
  サイト共通スクリプト（ライブラリなし・外部送信なし）
  <head> で defer なしで読み込む（表示設定をちらつきなく反映するため）。
  1. 表示設定（文字サイズ・配色）を、この端末のブラウザに保存して反映する
  2. ヘッダーに「表示」ボタンを追加する
  3. 記事ページ: 読了の目安、調査日からの経過、読み進み具合のバー、共有ボタン、
     トップへ戻るボタン、印刷時に折りたたみをすべて開く、
     記事の最後に「同じカテゴリの記事」を出す（index.html を読んで作る）
  4. トップページ: 記事の検索（空白で区切ると、すべてを含む記事）・カテゴリ絞り込み、
     新着記事、カテゴリごとの「残りを表示」、調査日からの経過。
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
    return h.textContent.replace(/（.*?）/g, "").trim();
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
      groups.push({ name: categoryName(h), heading: h, list: list, parts: parts, lis: items });
    });
    return groups;
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

  // ---------- 表示設定 ----------
  function setupSettings() {
    var header = document.querySelector(".site-header .container");
    if (!header) return;
    var nav = header.querySelector(".site-nav");
    if (!nav) {
      nav = el("nav", { class: "site-nav", "aria-label": "サイト内" });
      header.appendChild(nav);
    }

    var btn = el("button", { type: "button", class: "tools-btn", "aria-expanded": "false", "aria-controls": "display-settings" }, "表示");
    var panel = el("div", { class: "tools-panel", id: "display-settings", role: "dialog", "aria-label": "表示設定", hidden: "" });

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

    panel.appendChild(group("文字の大きさ", "rn-font", [["", "標準"], ["large", "大きめ"]], load(KEY_FONT) || "", function (v) {
      applyFont(v);
      save(KEY_FONT, v);
    }));
    panel.appendChild(group("配色", "rn-theme", [["", "自動（端末の設定）"], ["light", "ライト"], ["dark", "ダーク"]], load(KEY_THEME) || "", function (v) {
      applyTheme(v);
      save(KEY_THEME, v);
    }));
    panel.appendChild(el("p", { class: "tools-note" }, "設定はこの端末のブラウザにだけ保存されます。"));

    function open(state) {
      panel.hidden = !state;
      btn.setAttribute("aria-expanded", state ? "true" : "false");
    }

    btn.addEventListener("click", function () {
      open(panel.hidden);
      if (!panel.hidden) {
        var first = panel.querySelector("input:checked") || panel.querySelector("input");
        if (first) first.focus();
      }
    });
    document.addEventListener("click", function (e) {
      if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) open(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) {
        open(false);
        btn.focus();
      }
    });

    nav.appendChild(btn);
    header.appendChild(panel);
  }

  // ---------- 記事ページ ----------
  // 記事の最後に、同じカテゴリのほかの記事（なければ新着の記事）を出す
  function setupMoreArticles(article) {
    if (!window.fetch || !window.DOMParser || !/^https?:$/.test(location.protocol)) return;
    var file = location.pathname.split("/").pop();
    if (!file) return;
    fetch("../index.html")
      .then(function (res) {
        return res.ok ? res.text() : Promise.reject();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var groups = readGroups(doc);
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
        others.slice(0, 4).forEach(function (li) {
          var copy = document.importNode(li, true);
          var a = copy.querySelector("a.article-card");
          // index.html から見た「articles/xxx.html」を、記事ページから見た「xxx.html」に直す
          a.setAttribute("href", a.getAttribute("href").split("/").pop());
          Array.prototype.forEach.call(copy.querySelectorAll(".article-card-date time[datetime]"), addAgo);
          list.appendChild(copy);
        });
        section.appendChild(head);
        section.appendChild(list);
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
  var LATEST_COUNT = 6; // 新着記事の件数（スマホでは CSS で4件まで）

  function setupIndex(box) {
    Array.prototype.forEach.call(document.querySelectorAll(".article-card-date time[datetime]"), addAgo);

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

    // URL（?q=…&cat=…）から状態を読む
    function readUrl() {
      var p;
      try {
        p = new URLSearchParams(location.search);
      } catch (e) {
        return { q: "", cat: "" };
      }
      var cat = p.get("cat") || "";
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
        if (card) card.insertBefore(el("span", { class: "article-card-cat" }, catOf[all.indexOf(li)]), card.firstChild);
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

    function chip(label, value, n) {
      var b = el("button", { type: "button", class: "chip", "aria-pressed": value === active ? "true" : "false" }, label);
      b.appendChild(el("span", { class: "chip-count" }, String(n)));
      b.addEventListener("click", function () {
        active = value;
        Array.prototype.forEach.call(chipsWrap.querySelectorAll(".chip"), function (c) {
          c.setAttribute("aria-pressed", c === b ? "true" : "false");
        });
        render();
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

    // カテゴリを指定して開いたとき（記事のパンくずなどから）は、一覧の先頭が見える位置へ
    if (active && !location.hash) {
      box.scrollIntoView({ block: "start" });
    }
  }

  ready(function () {
    setupSettings();
    var article = document.querySelector("main article");
    if (article) setupArticle(article);
    var box = document.querySelector(".article-search-box");
    if (box) setupIndex(box);
  });
})();
