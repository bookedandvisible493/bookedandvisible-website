/*
 * Free visibility check (/free-check/): drives the steps of /api/mini-check.
 * 1 find (Turnstile) → 2 pick listing + service + city → 3 foundation + 3 AI engines
 * in parallel → 4 result, optional email. Scores are computed by the API's shared core.
 */
(function () {
  "use strict";

  var API = "/api/mini-check";
  var $ = function (id) { return document.getElementById(id); };
  var state = {};
  var widgetId = null;

  function show(id) {
    ["mc-off", "mc-find", "mc-pick", "mc-progress", "mc-result"].forEach(function (s) { $(s).hidden = s !== id; });
  }
  function err(id, msg) { var el = $(id); el.textContent = msg || ""; el.hidden = !msg; }
  function post(body) {
    return fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, message: "Something went wrong. Please try again." }; }); });
  }
  function text(el, s) { el.textContent = s; return el; }
  function track(name, params) { if (window.gtag) window.gtag("event", name, params || {}); }

  function loadTurnstile(siteKey) {
    window.mcTurnstileReady = function () {
      widgetId = window.turnstile.render("#mc-turnstile", { sitekey: siteKey, theme: "light" });
    };
    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=mcTurnstileReady";
    s.async = true;
    document.head.appendChild(s);
  }

  fetch(API).then(function (r) { return r.json(); }).then(function (cfg) {
    state.cfg = cfg;
    if (!cfg.enabled) return show("mc-off");
    if (!cfg.mock) loadTurnstile(cfg.siteKey);
    show("mc-find");
  }).catch(function () { show("mc-off"); });

  // Step 1: find the business
  $("mc-find").addEventListener("submit", function (e) {
    e.preventDefault();
    err("mc-find-err");
    var token = state.cfg.mock ? "" : (window.turnstile && window.turnstile.getResponse(widgetId)) || "";
    if (!state.cfg.mock && !token) return err("mc-find-err", "Please complete the 'I'm human' check first.");
    var btn = $("mc-find-btn");
    btn.disabled = true;
    state.searchText = $("mc-query").value;
    post({ step: "lookup", query: state.searchText, turnstileToken: token }).then(function (res) {
      btn.disabled = false;
      if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
      if (!res.ok) return err("mc-find-err", res.message);
      if (!res.candidates.length) return err("mc-find-err", "We couldn't find that business on Google. Try the exact name and city as shown on Google Maps.");
      state.ticket = res.ticket;
      var box = $("mc-cands");
      box.textContent = "";
      res.candidates.forEach(function (c, i) {
        var label = document.createElement("label");
        var input = document.createElement("input");
        input.type = "radio"; input.name = "mc-place"; input.value = c.placeId; input.required = true;
        if (i === 0) input.checked = true;
        var span = document.createElement("span");
        text(span, c.name);
        span.appendChild(text(document.createElement("small"), c.address));
        label.appendChild(input); label.appendChild(span);
        box.appendChild(label);
      });
      // "7635 198b St, Langley Twp, BC V2Y 3X9, Canada" -> "Langley Twp"; "Langley, BC" -> "Langley"
      var cityFrom = function (addr) {
        var p = String(addr || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean);
        return p.length >= 3 ? p[p.length - 3] : p[0] || "";
      };
      var cityEdited = false;
      $("mc-city").oninput = function () { cityEdited = true; };
      $("mc-city").value = cityFrom(res.candidates[0].address);
      box.onchange = function (ev) {
        var c = res.candidates.filter(function (x) { return x.placeId === ev.target.value; })[0];
        if (c && !cityEdited) $("mc-city").value = cityFrom(c.address);
      };
      show("mc-pick");
      track("free_check_found");
    }).catch(function () { btn.disabled = false; err("mc-find-err", "Network problem. Please try again."); });
  });

  $("mc-back").addEventListener("click", function () { show("mc-find"); });
  $("mc-again").addEventListener("click", function () { location.reload(); });

  function stepRow(key, label) {
    var li = document.createElement("li");
    li.id = "mc-step-" + key;
    li.appendChild(text(document.createElement("b"), label));
    li.appendChild(text(document.createElement("span"), "waiting"));
    $("mc-steps").appendChild(li);
  }
  function stepDone(key, msg) {
    var li = $("mc-step-" + key);
    if (!li) return;
    li.className = "done";
    li.lastChild.textContent = msg;
  }

  // Step 2–3: run the check
  $("mc-pick").addEventListener("submit", function (e) {
    e.preventDefault();
    err("mc-pick-err");
    var picked = document.querySelector("input[name=mc-place]:checked");
    state.placeId = picked && picked.value;
    state.service = $("mc-service").value;
    state.city = $("mc-city").value;
    $("mc-pname").textContent = picked ? picked.parentNode.querySelector("span").firstChild.textContent : "your business";
    $("mc-steps").textContent = "";
    stepRow("google", "Your Google listing");
    stepRow("website", "Your website");
    state.cfg.engines.forEach(function (eng) { stepRow(eng, eng); });
    show("mc-progress");
    track("free_check_started", { service: state.service });

    post({ step: "foundation", ticket: state.ticket, placeId: state.placeId }).then(function (f) {
      if (!f.ok) { show("mc-pick"); return err("mc-pick-err", f.message); }
      state.f = f;
      stepDone("google", f.profile.reviewCount + " reviews, " + (f.profile.rating || 0).toFixed(1) + "★");
      stepDone("website", !f.profile.website ? "no website listed" : f.site && f.site.reached ? "checked" : "couldn't load it");
      return Promise.all(state.cfg.engines.map(function (eng) {
        return post({ step: "ai", placeTicket: f.placeTicket, engine: eng, service: state.service, city: state.city, region: f.profile.region })
          .then(function (a) {
            var named = a.ok && a.status === "ok" ? a.cells.filter(function (c) { return c.cell > 0; }).length : null;
            stepDone(eng, named === null ? "unavailable" : "named you in " + named + " of " + a.cells.length);
            return a.ok ? { engine: eng, status: a.status, cells: a.cells } : { engine: eng, status: "unavailable", cells: [] };
          })
          .catch(function () { stepDone(eng, "unavailable"); return { engine: eng, status: "unavailable", cells: [] }; });
      })).then(function (ai) {
        state.ai = ai;
        return finish("");
      });
    }).catch(function () { show("mc-pick"); err("mc-pick-err", "Network problem. Please try again."); });
  });

  function finish(email, consent) {
    return post({ step: "finish", placeTicket: state.f.placeTicket, profile: state.f.profile, site: state.f.site, ai: state.ai,
      email: email, consent: !!consent, searchText: state.searchText, service: state.service, city: state.city })
      .then(function (res) {
        if (!email) render(res);
        return res;
      });
  }

  function render(res) {
    if (!res.ok) { show("mc-pick"); return err("mc-pick-err", res.message); }
    $("mc-r-label").textContent = res.quick.foundationOnly ? "Quick score (Google and website only)" : "Quick score";
    $("mc-r-score").textContent = res.quick.score;
    $("mc-r-band").textContent = res.quick.band;
    var answered = state.ai.filter(function (a) { return a.status === "ok"; });
    var cells = [].concat.apply([], answered.map(function (a) { return a.cells; }));
    var named = cells.filter(function (c) { return c.cell > 0; }).length;
    $("mc-r-summary").textContent = answered.length
      ? (answered.length === 1 ? answered[0].engine : "AI assistants") + " named you in " + named + " of " + cells.length + " answers. Google listing and website: " + state.f.foundation.score + "/100."
      : "The AI assistant didn't answer this time, so this score covers your Google listing and website only.";
    var t = $("mc-r-ai");
    t.textContent = "";
    if (answered.length) {
      var hr = t.insertRow();
      ["Search", "Assistant", "Result"].forEach(function (h) { var th = document.createElement("th"); th.textContent = h; hr.appendChild(th); });
      answered.forEach(function (a) {
        a.cells.forEach(function (c) {
          var r = t.insertRow();
          text(r.insertCell(), c.query);
          text(r.insertCell(), a.engine);
          text(r.insertCell(), c.cell === 1 ? "Named (#" + c.rank + ")" : c.cell > 0 ? "Mentioned" :
            "Not named" + (c.instead && c.instead.length ? " — named instead: " + c.instead.join(", ") : ""));
        });
      });
    }
    var top = res.top3[0];
    $("mc-r-issue-title").textContent = top ? "Your biggest fix: " + top.title : "Nice work — no major gaps found.";
    $("mc-r-issue-fix").textContent = top ? top.fix : "";
    show("mc-result");
    track("free_check_completed", { score: res.quick.score });
  }

  $("mc-email").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("mc-email-in").value.trim();
    var msg = $("mc-email-msg");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.hidden = false; msg.textContent = "Please enter a valid email."; return; }
    finish(email, $("mc-consent").checked).then(function (res) {
      msg.hidden = false;
      msg.textContent = res.ok && res.emailed ? "Sent. Check your inbox (and spam folder) in a minute." :
        res.ok ? "Thanks. We couldn't send the email right now; reply to hello@bookedandvisible.ca and we'll send it." : res.message;
      if (res.ok) track("free_check_emailed", { consent: $("mc-consent").checked });
    });
  });
})();
