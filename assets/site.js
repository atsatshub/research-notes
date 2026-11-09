/*
  サイト共通スクリプト（ライブラリなし・外部送信なし）
  <head> で defer なしで読み込む（表示設定をちらつきなく反映するため）。
  1. 表示設定（文字サイズ・配色）を、この端末のブラウザに保存して反映する
  2. ヘッダーに「表示」ボタンを追加する
  3. 記事ページ: 読了の目安、調査日からの経過、読み進み具合のバー、共有ボタン、
     トップへ戻るボタン、印刷時に折りたたみをすべて開く
  4. トップページ: 記事の検索・カテゴリ絞り込み、調査日からの経過
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

  function setupIndex(box) {
    Array.prototype.forEach.call(document.querySelectorAll(".article-card-date time[datetime]"), addAgo);

    var input = box.querySelector("#article-search");
    var chipsWrap = box.querySelector(".category-chips");
    var count = box.querySelector(".article-count");
    var empty = document.querySelector(".search-empty");
    var groups = [];

    Array.prototype.forEach.call(document.querySelectorAll("h3.article-group-title"), function (h) {
      var parts = [h];
      var list = null;
      for (var n = h.nextElementSibling; n && !n.matches("h3.article-group-title"); n = n.nextElementSibling) {
        if (n.matches("ul.article-list")) {
          list = n;
          parts.push(n);
          break;
        }
        parts.push(n);
      }
      if (!list) return;
      var name = h.textContent.replace(/（.*?）/g, "").trim();
      var items = Array.prototype.map.call(list.querySelectorAll(":scope > li"), function (li) {
        return { li: li, text: normalize(li.textContent + " " + h.textContent) };
      });
      groups.push({ name: name, parts: parts, items: items });
    });

    var total = groups.reduce(function (sum, g) {
      return sum + g.items.length;
    }, 0);
    var active = "";

    // 新着: 全カテゴリの記事を調査日の新しい順に並べ、上位4件を複製して「新着記事」に入れる
    var latest = document.querySelector(".latest");
    var latestList = latest ? latest.querySelector(".latest-list") : null;
    if (latestList) {
      var all = [];
      groups.forEach(function (g) {
        g.items.forEach(function (it) {
          var t = it.li.querySelector(".article-card-date time[datetime]");
          all.push({ li: it.li, date: t ? t.getAttribute("datetime") : "" });
        });
      });
      all.sort(function (a, b) {
        return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
      });
      all.slice(0, 4).forEach(function (it) {
        latestList.appendChild(it.li.cloneNode(true));
      });
      latest.hidden = all.length === 0;
    }

    function render() {
      var term = normalize(input.value);
      var shown = 0;
      // 検索・絞り込み中は新着を隠す（同じ記事が2回出ないように）
      if (latest) latest.hidden = !!(term || active);
      groups.forEach(function (g) {
        var inCategory = !active || g.name === active;
        var visible = 0;
        g.items.forEach(function (it) {
          var hit = inCategory && (!term || it.text.indexOf(term) !== -1);
          it.li.hidden = !hit;
          if (hit) visible++;
        });
        g.parts.forEach(function (p) {
          p.hidden = visible === 0;
        });
        shown += visible;
      });
      count.textContent = term || active ? shown + "件見つかりました（全" + total + "件）" : "全" + total + "件の記事";
      if (empty) empty.hidden = shown !== 0;
    }

    function chip(label, value) {
      var b = el("button", { type: "button", class: "chip", "aria-pressed": value === active ? "true" : "false" }, label);
      b.addEventListener("click", function () {
        active = value;
        Array.prototype.forEach.call(chipsWrap.querySelectorAll(".chip"), function (c) {
          c.setAttribute("aria-pressed", c === b ? "true" : "false");
        });
        render();
      });
      chipsWrap.appendChild(b);
    }

    chip("すべて", "");
    groups.forEach(function (g) {
      chip(g.name, g.name);
    });

    input.addEventListener("input", render);
    box.hidden = false;
    render();
  }

  ready(function () {
    setupSettings();
    var article = document.querySelector("main article");
    if (article) setupArticle(article);
    var box = document.querySelector(".article-search-box");
    if (box) setupIndex(box);
  });
})();
