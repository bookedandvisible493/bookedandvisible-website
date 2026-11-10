/*
 * Guides index: search, topic filter and sort (added 2026-11-10).
 * Every guide link is already in the page HTML (crawlable, works without
 * JavaScript); this script only hides, orders and groups the rows. State is
 * kept in the URL hash, e.g. /guides/#topic=reviews&q=qr&sort=topic.
 */
(function () {
  "use strict";
  var list = document.getElementById("gm-list");
  var bar = document.getElementById("gm-bar");
  if (!list || !bar) return;

  var items = [].slice.call(list.querySelectorAll(".gm-item"));
  var qi = document.getElementById("gm-q");
  var clr = document.getElementById("gm-clear");
  var chipsBox = document.getElementById("gm-chips");
  var srt = document.getElementById("gm-sort");
  var cnt = document.getElementById("gm-count");
  var most = document.getElementById("gm-most");
  var empty = document.getElementById("gm-empty");
  var groups = document.getElementById("gm-groups");
  var sortWrap = document.getElementById("gm-sortwrap");

  var cats = {}, order = [];
  var pref = ["local-seo", "reviews", "strategy", "ai-search", "directories", "websites"];
  items.forEach(function (li) {
    var k = li.getAttribute("data-cat");
    if (!(k in cats)) { cats[k] = li.getAttribute("data-label"); order.push(k); }
  });
  order.sort(function (a, b) {
    var x = pref.indexOf(a), y = pref.indexOf(b);
    return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
  });

  var cat = "all", q = "", sort = "new";
  var now = Date.now();
  items.forEach(function (li, i) {
    li._i = i;
    li._date = li.getAttribute("data-date");
    li._title = li.getAttribute("data-title");
    li._text = (li.textContent || "").toLowerCase();
    var tag = li.querySelector(".gm-new");
    if (tag && li._date && (now - Date.parse(li._date)) / 86400000 <= 30) tag.hidden = false;
  });

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function match(li) {
    if (cat !== "all" && li.getAttribute("data-cat") !== cat) return false;
    if (!q) return true;
    return q.toLowerCase().split(/\s+/).every(function (w) { return li._text.indexOf(w) > -1; });
  }
  function byDate(a, b) { return a._date < b._date ? 1 : a._date > b._date ? -1 : a._i - b._i; }
  function byTitle(a, b) { return a._title.localeCompare(b._title); }

  function render() {
    var shown = items.filter(match);
    items.forEach(function (li) { li.hidden = shown.indexOf(li) === -1; });
    groups.textContent = "";
    if (sort === "topic") {
      list.hidden = true; groups.hidden = false;
      order.forEach(function (k) {
        var g = shown.filter(function (li) { return li.getAttribute("data-cat") === k; }).sort(byDate);
        if (!g.length) return;
        var h = el("h2", "gm-group", cats[k]); h.appendChild(el("small", null, g.length + (g.length === 1 ? " guide" : " guides")));
        var ul = el("ul", "gm-list"); g.forEach(function (li) { ul.appendChild(li); });
        groups.appendChild(h); groups.appendChild(ul);
      });
    } else {
      groups.hidden = true; list.hidden = false;
      var sorted = items.slice().sort(sort === "az" ? byTitle : byDate);
      sorted.forEach(function (li) { list.appendChild(li); });
    }
    empty.hidden = shown.length > 0;
    if (!shown.length) {
      empty.querySelector("p").textContent = q ? "No guides match “" + q + "”. Try another word or clear the filters." : "No guides in this topic yet.";
    }
    cnt.textContent = "Showing " + shown.length + " of " + items.length + " guides" + (q ? " for “" + q + "”" : "");
    clr.hidden = !q;
    most.hidden = !!(q || cat !== "all");
  }

  function chips() {
    chipsBox.textContent = "";
    [["all", "All", items.length]].concat(order.map(function (k) {
      return [k, cats[k], items.filter(function (li) { return li.getAttribute("data-cat") === k; }).length];
    })).forEach(function (c) {
      var b = el("button", "gm-chip", c[1]); b.type = "button";
      b.setAttribute("aria-pressed", String(cat === c[0]));
      b.appendChild(el("span", null, String(c[2])));
      b.addEventListener("click", function () { cat = c[0]; sync(); });
      chipsBox.appendChild(b);
    });
  }

  function sync() {
    chips(); render();
    try {
      history.replaceState(null, "", location.pathname + location.search +
        ((cat !== "all" || q || sort !== "new") ? "#" + [cat !== "all" ? "topic=" + cat : "", q ? "q=" + encodeURIComponent(q) : "", sort !== "new" ? "sort=" + sort : ""].filter(Boolean).join("&") : ""));
    } catch (e) { /* ignore */ }
  }

  qi.addEventListener("input", function () { q = qi.value.trim(); sync(); });
  clr.addEventListener("click", function () { q = ""; qi.value = ""; sync(); qi.focus(); });
  srt.addEventListener("change", function () { sort = srt.value; sync(); });
  empty.querySelector("button").addEventListener("click", function () { q = ""; cat = "all"; qi.value = ""; sync(); });
  document.addEventListener("keydown", function (e) {
    var tag = document.activeElement && document.activeElement.tagName;
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(tag) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); qi.focus(); }
    else if (e.key === "Escape" && document.activeElement === qi && q) { q = ""; qi.value = ""; sync(); }
  });

  location.hash.slice(1).split("&").forEach(function (p) {
    var kv = p.split("=");
    if (kv[0] === "topic" && cats[kv[1]]) cat = kv[1];
    if (kv[0] === "q") { try { q = decodeURIComponent(kv[1] || ""); } catch (e) { q = ""; } qi.value = q; }
    if (kv[0] === "sort" && /^(new|topic|az)$/.test(kv[1])) { sort = kv[1]; srt.value = sort; }
  });

  bar.hidden = false; sortWrap.hidden = false;
  sync();
})();
