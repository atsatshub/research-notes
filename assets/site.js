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
     カテゴリごとの「残りを表示」、調査日からの経過。
     検索は、カードの題名・説明に加えて、記事の中の見出し・要点まで探す
     （assets/search-index.json を、検索欄を使うときに読む。一致した章へのリンクをカードの下に出す）。
     並び順は「カテゴリ別」「新しい順」「古い順」を切り替えられる
     （以前あった「新着記事」の枠は、新しい順の一覧と重なるのでなくした）。
     「おまかせで1本読む」は記事を1本選んで開く。
     記事カードの題名は「：」の前後で分け、後ろを小さく表示する。
     検索語・カテゴリ・並び順は URL（?q=…&cat=…&sort=new または old）に残すので、共有や「戻る」で同じ状態に戻れる
  5. この端末に残す記録（ブラウザの localStorage だけ。外には送らない）
     - あとで読む: 記事の「あとで読む」で保存し、トップの「保存した記事」で一覧する
     - 読んだ記事: 読み進んだ割合と章を記録し、カードに「読みかけ」「読了」の印を出す。
       読みかけの記事を開くと「続きから読む」を出す。メニューの「この端末の記録」で、記録をやめる・消すことができる
     - 前回の訪問より後に追加された記事に「新着」の印を出す
  6. 記事ページの道具: 見出しへのリンクのコピー、横に長い表の「横にスクロールできます」、
     誤りを知らせるリンク（GitHub の Issue）。検索結果から章へ移るときは、検索語を記事の中で目立たせる
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

  // ---------- この端末に残す記録（表示設定と同じく、ブラウザの localStorage だけ。外には送らない） ----------
  var KEY_SAVED = "rn-saved"; // あとで読む: 記事名の配列（新しく保存したものが先）
  var KEY_READ = "rn-read"; // 読んだ記事: { 記事名: [開いた時刻, いちばん先まで読んだ割合, 最後にいた章の id, そのときの割合] }
  var KEY_HISTORY = "rn-history"; // "off" のとき、読んだ記事を記録しない
  var KEY_SEEN = "rn-seen"; // トップで見た新着: [前回までに見た通し番号, いま見ている通し番号, 区切りを進めた時刻]
  var SAVED_MAX = 200; // 保存できる記事の数
  var READ_MAX = 200; // 読んだ記事の記録の数（古いものから捨てる）
  var READ_DONE = 90; // この割合まで読んだら「読了」
  var READ_PART = 10; // この割合まで読んだら「読みかけ」（開いてすぐ閉じた記事は数えない）
  var SEEN_HOURS = 6; // 前の訪問からこの時間があいたら、「新着」の区切りを進める

  function loadJson(key, fallback) {
    try {
      var v = JSON.parse(load(key));
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function savedList() {
    var v = loadJson(KEY_SAVED, []);
    return Array.isArray(v)
      ? v.filter(function (x) {
          return typeof x === "string";
        })
      : [];
  }

  function setSaved(slug, on) {
    var list = savedList().filter(function (x) {
      return x !== slug;
    });
    if (on) list.unshift(slug);
    save(KEY_SAVED, list.length ? JSON.stringify(list.slice(0, SAVED_MAX)) : "");
  }

  function historyOn() {
    return load(KEY_HISTORY) !== "off";
  }

  function readMap() {
    var v = loadJson(KEY_READ, {});
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  }

  // 読んだ割合（0〜100）と、いまいる章を記録する
  function recordRead(slug, percent, sectionId) {
    if (!historyOn() || !slug) return;
    var map = readMap();
    var old = Array.isArray(map[slug]) ? map[slug] : [0, 0, "", 0];
    var entry = [Date.now(), Math.max(old[1] || 0, percent), old[2] || "", old[3] || 0];
    // 最後にいた場所は、本文を読み進めたときだけ書き換える（開いてすぐ閉じても、前回の続きが消えないように）
    if (percent >= READ_PART) {
      entry[2] = sectionId || "";
      entry[3] = percent;
    }
    map[slug] = entry;
    var keys = Object.keys(map);
    if (keys.length > READ_MAX) {
      keys
        .sort(function (a, b) {
          return (map[b][0] || 0) - (map[a][0] || 0);
        })
        .slice(READ_MAX)
        .forEach(function (k) {
          delete map[k];
        });
    }
    save(KEY_READ, JSON.stringify(map));
  }

  // 記録からの状態: "done"（最後まで読んだ）/ "part"（途中まで）/ ""（なし）
  function readState(entry) {
    if (!Array.isArray(entry)) return "";
    if ((entry[1] || 0) >= READ_DONE) return "done";
    return (entry[1] || 0) >= READ_PART ? "part" : "";
  }

  // カードの調査日の行に、この端末の記録からの印（新着・保存済み・読みかけ・読了）を添える
  function addFlags(li, slug, saved, map, isNew) {
    var date = li.querySelector(".article-card-date");
    if (!date) return;
    Array.prototype.forEach.call(date.querySelectorAll(".card-flag"), function (n) {
      n.remove();
    });
    var doc = li.ownerDocument || document;
    function flag(cls, text) {
      var span = doc.createElement("span");
      span.className = "card-flag " + cls;
      span.textContent = text;
      date.appendChild(span); // 日付の文字のあとに置く（入りきらないときは、印だけが次の行に回る）
    }
    var state = readState(map[slug]);
    if (state === "done") flag("is-done", "読了");
    else if (state === "part") flag("is-part", "読みかけ");
    if (saved.indexOf(slug) !== -1) flag("is-saved", "保存済み");
    if (isNew) flag("is-new", "新着");
  }

  // 文字列をクリップボードへ（できたかどうかを done に伝える）
  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          done(true);
        },
        function () {
          done(false);
        }
      );
    } else {
      done(false);
    }
  }

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
    date.appendChild(span); // 日付の文字のあとに置く（入りきらないときは、印だけが次の行に回る）
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
    // ラベルは「メニュー」と「閉じる」を同じ場所に重ねておき、見せるほうを CSS で切り替える
    // （文字数が違ってもボタンの幅が変わらないので、隣の「記事一覧」などが動かない）
    var btnLabel = el("span", { class: "menu-btn-label" });
    btnLabel.appendChild(el("span", { class: "menu-btn-text is-closed" }, "メニュー"));
    btnLabel.appendChild(el("span", { class: "menu-btn-text is-opened" }, "閉じる"));
    btn.setAttribute("aria-label", "メニューを開く");
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
      btn.setAttribute("aria-label", state ? "メニューを閉じる" : "メニューを開く");
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
    // 保存した記事（あとで読む）: トップの一覧を、保存した記事だけにして開く
    var savedLink = el("a", { class: "menu-saved", href: base + "index.html?list=saved" }, "保存した記事（" + savedList().length + "）");
    savedLink.addEventListener("click", function (e) {
      if (!indexApi) return;
      e.preventDefault();
      open(false);
      indexApi.saved();
    });
    findSec.appendChild(savedLink);

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

    // 6. この端末の記録（あとで読む・読んだ記事）: 記録をやめる・消す
    var recSec = section("この端末の記録");
    recSec.appendChild(group("読んだ記事の記録", "rn-history", [["", "残す"], ["off", "残さない"]], historyOn() ? "" : "off", function (v) {
      save(KEY_HISTORY, v);
      // 残さないにしたら、いまある記録も消す
      if (v === "off") save(KEY_READ, "");
    }));
    var clearBtn = el("button", { type: "button", class: "random-btn clear-btn" }, "保存した記事と記録を消す");
    clearBtn.addEventListener("click", function () {
      if (!window.confirm("「あとで読む」で保存した記事と、読んだ記事の記録を、この端末から消します。よろしいですか？")) return;
      save(KEY_SAVED, "");
      save(KEY_READ, "");
      save(KEY_SEEN, "");
      location.reload();
    });
    recSec.appendChild(clearBtn);
    recSec.appendChild(el("p", { class: "tools-note" }, "「あとで読む」と読んだ記事の記録は、この端末のブラウザにだけ保存されます（外には送られません）。"));

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
          // この端末の記録からの印（保存済み・読みかけ・読了）
          addFlags(copy, name.replace(/\.html$/, ""), savedList(), readMap(), false);
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
    var slug = location.pathname.split("/").pop().replace(/\.html$/, "");

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
      var sayTimer = null;
      var say = function (text) {
        status.textContent = text;
        clearTimeout(sayTimer);
        sayTimer = setTimeout(function () {
          status.textContent = "";
        }, 4000);
      };
      share.addEventListener("click", function () {
        var url = location.href.split("#")[0];
        var title = document.title;
        if (navigator.share) {
          navigator.share({ title: title, url: url }).catch(function () {});
          return;
        }
        var done = function () {
          say("コピーしました");
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, function () {
            status.textContent = url;
          });
        } else {
          status.textContent = url;
        }
      });
      // あとで読む（この端末に保存する。トップの「保存した記事」で一覧できる）
      var keep = el("button", { type: "button", class: "share-btn save-btn", "aria-pressed": "false" });
      var showKeep = function () {
        var on = savedList().indexOf(slug) !== -1;
        keep.setAttribute("aria-pressed", on ? "true" : "false");
        keep.textContent = on ? "保存済み" : "あとで読む";
        keep.title = on ? "押すと、保存を取り消します" : "この端末に保存します";
      };
      keep.addEventListener("click", function () {
        var on = savedList().indexOf(slug) === -1;
        setSaved(slug, on);
        showKeep();
        if ((savedList().indexOf(slug) !== -1) !== on) say("この端末では保存できませんでした（ブラウザの設定で、サイトのデータの保存が止められています）");
        else say(on ? "保存しました。トップの「保存した記事」から開けます" : "保存を取り消しました");
      });
      showKeep();

      var wrap = el("div", { class: "share-row" });
      wrap.appendChild(share);
      wrap.appendChild(keep);
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
        spy.push({ id: id, label: a.textContent, target: target, links: links });
      });
      sideToc.appendChild(sideList);
      document.body.appendChild(sideToc);
    }

    // 読んだ記事の記録（この端末だけ）。読み進んだ割合と、いまいる章を残す
    var before = readMap()[slug]; // 書き換える前の記録（「続きから読む」に使う）
    var recorded = -1;
    var recordedAt = 0;
    function readPercent() {
      var r = article.getBoundingClientRect();
      if (r.height <= 0) return 0;
      return Math.max(0, Math.min(100, Math.round(((window.innerHeight - r.top) / r.height) * 100)));
    }
    // こまめに書きすぎないよう、3ポイント以上進み、前の記録から2秒たったときだけ書く（force のときは必ず書く）
    function keepRecord(force) {
      var p = readPercent();
      var now = Date.now();
      if (!force && (Math.abs(p - recorded) < 3 || now - recordedAt < 2000)) return;
      recorded = p;
      recordedAt = now;
      recordRead(slug, p, spyCurrent >= 0 ? spy[spyCurrent].id : "");
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
      keepRecord(false);
    }
    window.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });
    window.addEventListener("resize", update);
    update();
    keepRecord(true);
    // ページを離れるとき・隠れるときにも記録する（スマホではタブを切り替えたまま閉じることが多い）
    window.addEventListener("pagehide", function () {
      keepRecord(true);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") keepRecord(true);
    });

    // 章を指す URL に検索語の強調（:~:text=）を付けて開いたとき、語が記事の中に見つからないと、
    // 章へ移らずページの先頭のままになるブラウザがある。そのときは、少し待ってから自分で章へ移す
    if (location.hash.length > 1) {
      setTimeout(function () {
        var to = document.getElementById(location.hash.slice(1));
        if (to && window.scrollY < 50 && to.getBoundingClientRect().top > window.innerHeight) to.scrollIntoView({ block: "start" });
      }, 800);
    }

    // 続きから読む: 前に途中まで読んだ記事を開いたら、最後にいた章へ移るボタンを出す
    // （章を指して開いたとき、最後まで読んだ記事、ブラウザが元の位置に戻したときは出さない）
    if (before && historyOn() && !location.hash && readState(before) === "part" && (before[3] || 0) >= READ_PART && before[2]) {
      var resumeAt = null;
      spy.forEach(function (x) {
        if (x.id === before[2]) resumeAt = x;
      });
      if (resumeAt) {
        setTimeout(function () {
          if (window.scrollY > 400) return;
          var toast = el("div", { class: "resume-toast", role: "status" });
          toast.appendChild(el("span", { class: "resume-text" }, "前回は「" + resumeAt.label + "」まで読みました"));
          var go = el("button", { type: "button", class: "share-btn resume-go" }, "続きから読む");
          var close = el("button", { type: "button", class: "resume-close", "aria-label": "閉じる" }, "×");
          var hide = function () {
            toast.remove();
          };
          go.addEventListener("click", function () {
            hide();
            resumeAt.target.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
          });
          close.addEventListener("click", hide);
          toast.appendChild(go);
          toast.appendChild(close);
          document.body.appendChild(toast);
          setTimeout(hide, 20000);
        }, 600);
      }
    }

    // 見出しへのリンクをコピー（章を指して共有できるように。アドレス欄もその章の URL にする）
    var headingStatus = el("span", { class: "sr-only", role: "status", "aria-live": "polite" });
    document.body.appendChild(headingStatus);
    Array.prototype.forEach.call(article.querySelectorAll("h2[id]"), function (h) {
      var name = h.textContent.trim();
      var b = el("button", { type: "button", class: "heading-link", "aria-label": "「" + name + "」へのリンクをコピー", title: "この見出しへのリンクをコピー" }, "#");
      b.addEventListener("click", function () {
        var url = location.href.split("#")[0] + "#" + h.id;
        if (window.history && history.replaceState && /^https?:$/.test(location.protocol)) history.replaceState(null, "", "#" + h.id);
        copyText(url, function (ok) {
          b.setAttribute("data-done", ok ? "コピーしました" : "アドレス欄の URL をコピーしてください");
          headingStatus.textContent = ok ? "「" + name + "」へのリンクをコピーしました" : "アドレス欄の URL が、この見出しへのリンクになりました";
          setTimeout(function () {
            b.removeAttribute("data-done");
            headingStatus.textContent = "";
          }, 2500);
        });
      });
      h.appendChild(b);
    });

    // 横に長い表: はみ出しているときだけ「横にスクロールできます」と添える（一度動かしたら消す）
    Array.prototype.forEach.call(article.querySelectorAll(".table-wrap"), function (w) {
      var hint = null;
      var used = false;
      var check = function () {
        var over = !used && w.scrollWidth > w.clientWidth + 4;
        if (over && !hint) {
          hint = el("p", { class: "table-hint", "aria-hidden": "true" }, "表は横にスクロールできます →");
          w.insertAdjacentElement("beforebegin", hint);
        }
        if (hint) hint.hidden = !over;
      };
      w.addEventListener("scroll", function () {
        if (!used && w.scrollLeft > 8) {
          used = true;
          check();
        }
      }, { passive: true });
      // 折りたたみの中の表は、開いたときに幅が決まるので、大きさが変わるたびに確かめる
      if (window.ResizeObserver) new ResizeObserver(check).observe(w);
      else window.addEventListener("resize", check);
      check();
    });

    // 誤りを知らせるリンク（フッターのお問い合わせと同じ GitHub の Issue に、記事名と URL を入れて開く）
    var disclaimer = article.querySelector(".disclaimer");
    var issues = document.querySelector('.site-footer a[href*="github.com"][href$="/issues"]');
    var h1 = article.querySelector("h1");
    if (disclaimer && issues && h1) {
      var issueUrl = issues.getAttribute("href") + "/new?title=" + encodeURIComponent("［記事の指摘］" + h1.textContent.trim()) +
        "&body=" + encodeURIComponent("記事: " + location.href.split("#")[0].split("?")[0] + "\n\n気づいた点（どの部分が、どう違うか。根拠になるページがあれば、その URL も）:\n");
      var report = el("p", { class: "report-line" });
      report.appendChild(document.createTextNode("誤りや古くなった内容に気づいたら、"));
      report.appendChild(el("a", { href: issueUrl, target: "_blank", rel: "noopener" }, "GitHub で知らせる"));
      report.appendChild(document.createTextNode("ことができます（投稿は公開されます）。"));
      disclaimer.appendChild(report);
    }

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
          seq: parseInt(li.getAttribute("data-seq"), 10) || 0,
          isNew: false, // 前回の訪問より後に追加された記事か
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

    // メニュー（カテゴリの件数・おまかせ）にも、ここで読んだ内容を渡す
    // （並び順を変えるとカードが別の一覧へ移るので、あとから画面を読み直すと件数が 0 になる）
    indexPromise = Promise.resolve({ groups: groups, doc: document });

    // すべての記事（一覧に書いてある順）と、新しい順・古い順に並べたもの
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
    var byOldest = byNewest.slice().reverse();
    var total = allItems.length;

    // この端末の記録: 保存した記事・読んだ記事・前回の訪問より後に追加された記事
    var saved = savedList();
    var readRec = readMap();
    var maxSeq = allItems.reduce(function (m, it) {
      return Math.max(m, it.seq);
    }, 0);
    // [前回までに見た通し番号, いま見ている通し番号, 区切りを進めた時刻]。
    // 前の訪問から時間があいていたら区切りを進めるので、同じ訪問のあいだは「新着」の印が残る
    var seen = loadJson(KEY_SEEN, null);
    if (!Array.isArray(seen) || seen.length !== 3) seen = [maxSeq, maxSeq, Date.now()];
    else if (Date.now() - seen[2] > SEEN_HOURS * 3600000) seen = [seen[1], maxSeq, Date.now()];
    else seen[1] = maxSeq;
    save(KEY_SEEN, JSON.stringify(seen));
    var newCount = 0;
    allItems.forEach(function (it) {
      it.isNew = seen[0] > 0 && it.seq > seen[0];
      if (it.isNew) newCount++;
    });

    // 「カテゴリ別の記事一覧」の見出し（並び順が「新しい順」のときは書き換える）
    var major = document.getElementById("categories");
    var majorTitle = major ? major.querySelector("h2") : null;
    var majorTitleText = majorTitle ? majorTitle.textContent : "";
    var catNote = document.querySelector(".categories-note");

    // URL（?q=…&cat=…&sort=new または old）から状態を読む
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
      var sort = p.get("sort");
      return { q: p.get("q") || "", cat: known ? cat : "", view: major && (sort === "new" || sort === "old") ? sort : "", saved: p.get("list") === "saved" };
    }

    function writeUrl(q, cat, sort, list) {
      if (!window.history || !history.replaceState || !/^https?:$/.test(location.protocol)) return;
      var p = [];
      if (q) p.push("q=" + encodeURIComponent(q));
      if (cat) p.push("cat=" + encodeURIComponent(cat));
      if (sort) p.push("sort=" + encodeURIComponent(sort));
      if (list) p.push("list=saved");
      var url = location.pathname + (p.length ? "?" + p.join("&") : "") + location.hash;
      if (url !== location.pathname + location.search + location.hash) history.replaceState(null, "", url);
    }

    var state = readUrl();
    var active = state.cat;
    var view = state.view; // "" = カテゴリ別、"new" = 新しい順、"old" = 古い順
    var flatLimit = FLAT_PAGE;
    var onlySaved = !!state.saved; // 「保存した記事」だけを出しているか
    input.value = state.q;

    // カテゴリの見出しがない並び（新しい順・古い順）で見せるカテゴリ名
    allItems.forEach(function (it) {
      addCatLabel(it.li, it.group.name);
      addFlags(it.li, it.slug, saved, readRec, it.isNew);
    });

    // 並び順の切り替え（カテゴリ別／新しい順／古い順）と、新しい順・古い順のときに使う一覧
    var switchWrap = el("div", { class: "view-switch", role: "group", "aria-label": "並び順" });
    switchWrap.appendChild(el("span", { class: "view-switch-label", "aria-hidden": "true" }, "並び順"));
    [["", "カテゴリ別"], ["new", "新しい順"], ["old", "古い順"]].forEach(function (v) {
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
      var first = flatOrder()[flatLimit];
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

    // 新しい順・古い順のときの並び（カテゴリ別のときは使わない）
    function flatOrder() {
      return view === "old" ? byOldest : byNewest;
    }

    // 記事カードを、並び順に合った場所へ移す（新しい順・古い順: ひとつの一覧へ。カテゴリ別: 元のカテゴリへ、元の順で）
    function placeItems() {
      if (view) {
        flatOrder().forEach(function (it) {
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
      if (onlySaved && saved.indexOf(it.slug) === -1) return false;
      return terms.every(function (t) {
        return it.text.indexOf(t) !== -1 || (!!it.deep && it.deep.text.indexOf(t) !== -1);
      });
    }

    // 検索語を、移動先の記事の中で目立たせる指定（URL の「:~:text=」。対応しているブラウザだけ）。
    // 記事の中にその語が見つからないときは、章の先頭へ移るだけになる
    function textDirective(terms) {
      if (!document.fragmentDirective) return "";
      return ":~:" + terms
        .map(function (t) {
          return "text=" + encodeURIComponent(t).replace(/-/g, "%2D");
        })
        .join("&");
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
        p.appendChild(el("a", { href: "articles/" + it.slug + ".html#" + f.s.id + textDirective(terms) }, label));
      });
      it.li.appendChild(p);
      it.hits = p;
    }

    function render() {
      var terms = searchTerms(input.value);
      var filtering = terms.length > 0 || !!active || onlySaved;
      var flat = view === "new" || view === "old";
      var shown = 0;
      flatList.hidden = !flat;
      if (flat) {
        flatOrder().forEach(function (it) {
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
      if (majorTitle) majorTitle.textContent = flat ? (view === "old" ? "記事一覧（古い順）" : "記事一覧（新しい順）") : majorTitleText;
      if (catNote) catNote.textContent = flat ? "全" + total + "件" : groups.length + "カテゴリ・全" + total + "件";
      var deepNote = terms.length && deepState === "ready" ? "。記事の中の見出し・要点も検索" : "";
      if (onlySaved && !terms.length && !active) count.textContent = "保存した記事 " + shown + "件（全" + total + "件）";
      else count.textContent = filtering ? shown + "件見つかりました（全" + total + "件" + deepNote + "）" : "全" + total + "件の記事";
      if (empty) {
        empty.textContent = onlySaved && !saved.length ? "保存した記事はまだありません。記事の題名の下にある「あとで読む」を押すと、ここに並びます。" : emptyText;
        empty.hidden = shown !== 0;
      }
      // 保存した記事のボタン（1件もなく、絞り込んでもいないときは出さない）
      savedBtn.hidden = !saved.length && !onlySaved;
      savedBtn.setAttribute("aria-pressed", onlySaved ? "true" : "false");
      // 前回の訪問より後に追加された記事の案内（絞り込み中と、新しい順のときは出さない）
      newNote.hidden = !newCount || filtering || view === "new";
      writeUrl(input.value.trim(), active, view, onlySaved);
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

    // 件数の行: 左に件数と「前回から N件追加」、右に「保存した記事」「おまかせで1本読む」
    var emptyText = empty ? empty.textContent : "";
    var foot = el("div", { class: "search-foot" });
    count.parentNode.insertBefore(foot, count);
    var footMain = el("div", { class: "search-foot-main" });
    footMain.appendChild(count);
    var newNote = el("button", { type: "button", class: "new-note", hidden: "" }, "前回から" + newCount + "件追加（新しい順で見る）");
    newNote.addEventListener("click", function () {
      setView("new");
      if (major) major.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    });
    footMain.appendChild(newNote);
    foot.appendChild(footMain);
    var actions = el("div", { class: "search-actions" });
    foot.appendChild(actions);
    var savedBtn = el("button", { type: "button", class: "random-btn saved-btn", "aria-pressed": "false", hidden: "" }, "保存した記事");
    savedBtn.appendChild(el("span", { class: "chip-count" }, String(saved.length)));
    savedBtn.addEventListener("click", function () {
      onlySaved = !onlySaved;
      render();
    });
    actions.appendChild(savedBtn);
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
    actions.appendChild(randomBtn);

    // 読みかけの記事（いちばん最近のもの）への近道。最後にいた章へ移る
    var resume = null;
    allItems.forEach(function (it) {
      var rec = readRec[it.slug];
      if (readState(rec) !== "part" || (rec[3] || 0) < READ_PART) return;
      if (!resume || (rec[0] || 0) > (resume.rec[0] || 0)) resume = { it: it, rec: rec };
    });
    if (resume) {
      var titleEl = resume.it.li.querySelector(".article-card-title");
      var titleCopy = titleEl ? titleEl.cloneNode(true) : null;
      if (titleCopy) {
        Array.prototype.forEach.call(titleCopy.querySelectorAll(".article-card-sub"), function (n) {
          n.remove();
        });
        var line = el("p", { class: "resume-line" });
        line.appendChild(el("span", { class: "card-flag is-part" }, "読みかけ"));
        line.appendChild(el("a", { href: "articles/" + resume.it.slug + ".html" + (resume.rec[2] ? "#" + resume.rec[2] : "") }, titleCopy.textContent.trim()));
        line.appendChild(el("span", { class: "resume-note" }, "（" + resume.rec[3] + "%まで）"));
        box.appendChild(line);
      }
    }

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
        onlySaved = false;
        input.value = text || "";
        if (input.value) loadDeep();
        setCategory("");
        showResults();
      },
      category: function (name) {
        input.value = "";
        onlySaved = false;
        setCategory(name);
        showResults();
      },
      saved: function () {
        input.value = "";
        onlySaved = true;
        setCategory("");
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
