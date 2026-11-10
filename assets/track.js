/*
 * Lead-event tracking for Google Analytics 4 (added 2026-11-09).
 * Sends only non-personal values: which kind of link was tapped, where on the
 * page it sat, and the page path. Never names, phone numbers or typed text.
 * gtag() is defined inline in every page head with Consent Mode v2 defaults,
 * so nothing is stored until the visitor accepts cookies.
 *   text_tap / call_tap / email_tap : taps on sms:, tel:, mailto: links
 *   generate_lead                   : only after the form was accepted, i.e. on
 *                                     the order thank-you page or after the
 *                                     FormSubmit redirect back with ?sent=1
 */
(function () {
  "use strict";

  function send(name, params) {
    if (typeof window.gtag !== "function") return;
    try { window.gtag("event", name, params); } catch (e) { /* never break the page */ }
  }

  function where(el) {
    if (el.closest("#bv-contact")) return "chat_widget";
    if (el.closest("header")) return "header";
    if (el.closest("footer")) return "footer";
    return "page";
  }

  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var h = (a.getAttribute("href") || "").toLowerCase();
    var name = h.indexOf("sms:") === 0 ? "text_tap"
             : h.indexOf("tel:") === 0 ? "call_tap"
             : h.indexOf("mailto:") === 0 ? "email_tap" : "";
    if (!name) return;
    send(name, { link_location: where(a), page_path: location.pathname });
  }, true);

  function leadOnce(type) {
    try {
      var k = "bv_lead_" + type + "_" + location.pathname;
      if (window.sessionStorage.getItem(k)) return;
      window.sessionStorage.setItem(k, "1");
    } catch (e) { /* storage blocked: send anyway */ }
    send("generate_lead", { form_type: type, page_path: location.pathname });
  }

  if (location.pathname.indexOf("/order/thank-you") === 0) leadOnce("order");
  else if (/[?&]sent=1(&|$)/.test(location.search)) leadOnce("question");
})();
