/*
  出典の吹き出し表示（ライブラリなし）
  - 本文の [n]（a.ref）にマウスを乗せる・フォーカスする・タップすると、
    記事末尾の出典（#src-n）の内容を小さな吹き出しで表示する。
  - 出典一覧（details#sources）は普段は閉じておき、#sources / #src-n へ移動したときに開く。
  - JS が動かない環境でも、[n] を押せば末尾の出典へ移動できる。
*/
(function () {
  "use strict";

  var pop = null;
  var current = null;
  var hideTimer = null;
  var lastPointerType = "mouse";

  function refFrom(node) {
    return node && node.closest ? node.closest("a.ref") : null;
  }

  function sourceFor(ref) {
    var href = ref.getAttribute("href") || "";
    return href.charAt(0) === "#" ? document.getElementById(href.slice(1)) : null;
  }

  function openSources() {
    var box = document.getElementById("sources");
    if (box && box.tagName === "DETAILS") box.open = true;
  }

  function hide() {
    clearTimeout(hideTimer);
    if (pop) {
      pop.remove();
      pop = null;
    }
    if (current) {
      current.removeAttribute("aria-describedby");
      current = null;
    }
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 250);
  }

  function position(ref) {
    var r = ref.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var w = pop.offsetWidth;
    var h = pop.offsetHeight;
    var left = Math.max(16, Math.min(r.left + r.width / 2 - w / 2, vw - w - 16));
    var top = r.bottom + 6;
    if (top + h > window.innerHeight && r.top - h - 6 > 0) top = r.top - h - 6;
    pop.style.left = left + window.scrollX + "px";
    pop.style.top = top + window.scrollY + "px";
  }

  function show(ref) {
    var li = sourceFor(ref);
    if (!li) return;
    if (current === ref) {
      clearTimeout(hideTimer);
      return;
    }
    hide();
    pop = document.createElement("div");
    pop.className = "ref-pop";
    pop.id = "ref-pop";
    pop.setAttribute("role", "tooltip");
    var num = document.createElement("span");
    num.className = "ref-pop-num";
    num.textContent = ref.textContent;
    pop.appendChild(num);
    Array.prototype.forEach.call(li.childNodes, function (n) {
      pop.appendChild(n.cloneNode(true));
    });
    pop.addEventListener("mouseenter", function () {
      clearTimeout(hideTimer);
    });
    pop.addEventListener("mouseleave", scheduleHide);
    document.body.appendChild(pop);
    current = ref;
    ref.setAttribute("aria-describedby", "ref-pop");
    position(ref);
  }

  document.addEventListener("pointerdown", function (e) {
    lastPointerType = e.pointerType || "mouse";
    if (pop && !pop.contains(e.target) && !refFrom(e.target)) hide();
  });

  document.addEventListener("pointerover", function (e) {
    var ref = refFrom(e.target);
    if (ref && e.pointerType === "mouse") show(ref);
  });

  document.addEventListener("pointerout", function (e) {
    var ref = refFrom(e.target);
    if (ref && ref === current && e.pointerType === "mouse") scheduleHide();
  });

  // フォーカスで開くのはキーボード操作のときだけ（タップ時はクリック側で開閉する）
  document.addEventListener("focusin", function (e) {
    var ref = refFrom(e.target);
    if (ref && lastPointerType === "keyboard") show(ref);
  });

  document.addEventListener("focusout", function (e) {
    if (refFrom(e.target) && !(pop && pop.contains(e.relatedTarget))) scheduleHide();
  });

  document.addEventListener("click", function (e) {
    var ref = refFrom(e.target);
    if (!ref) return;
    var type = e.pointerType || lastPointerType;
    if (e.detail !== 0 && (type === "touch" || type === "pen")) {
      // タップでは移動せずに吹き出しを開く（もう一度タップで閉じる）
      e.preventDefault();
      if (current === ref) hide();
      else show(ref);
      return;
    }
    // マウス・キーボードでは従来どおり出典一覧へ移動する
    hide();
    openSources();
  });

  document.addEventListener("keydown", function (e) {
    lastPointerType = "keyboard";
    if (e.key === "Escape") hide();
  });

  window.addEventListener("resize", hide);

  function revealHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (id !== "sources" && id.indexOf("src-") !== 0) return;
    openSources();
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: "center" });
  }

  window.addEventListener("hashchange", revealHash);
  revealHash();
})();
