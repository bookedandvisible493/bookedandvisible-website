/*
 * Site-wide "Connect with us" button (bottom-right) with a short question
 * form. Submissions go to hello@ through FormSubmit, the same backend as the
 * FAQ form, so the order operator picks them up as support questions.
 * The button lifts itself above the cookie banner while that is showing.
 */
(function () {
"use strict";
if (document.getElementById("bv-contact")) return;

var here = location.origin + location.pathname;
var wrap = document.createElement("div");
wrap.id = "bv-contact";
wrap.innerHTML =
'<div class="bvc-panel" id="bvc-panel" role="dialog" aria-modal="false" aria-labelledby="bvc-title" hidden>' +
  '<div class="bvc-head"><h2 id="bvc-title">Ask us anything</h2>' +
  '<button type="button" class="bvc-close" aria-label="Close">&times;</button></div>' +
  '<p class="bvc-sub">Viktor replies personally within one business day.</p>' +
  '<form class="bvc-form" action="https://formsubmit.co/hello@bookedandvisible.ca" method="POST">' +
    '<input type="hidden" name="_subject" value="New question from bookedandvisible.ca">' +
    '<input type="hidden" name="_template" value="table">' +
    '<input type="hidden" name="_captcha" value="true">' +
    '<input type="hidden" name="_next" value="' + here + '?sent=1">' +
    '<input type="hidden" name="Page" value="' + location.pathname + '">' +
    '<input type="text" name="_honey" class="bvc-honey" tabindex="-1" autocomplete="off" aria-hidden="true">' +
    '<label for="bvc-name">Your name</label><input id="bvc-name" type="text" name="name" autocomplete="name" required>' +
    '<label for="bvc-email">Email</label><input id="bvc-email" type="email" name="email" autocomplete="email" required>' +
    '<label for="bvc-q">Your question</label><textarea id="bvc-q" name="Question" rows="4" required></textarea>' +
    '<button type="submit" class="bvc-send">Send question</button>' +
    '<p class="bvc-fine">By sending, you agree to our <a href="/privacy.html">Privacy Policy</a>.</p>' +
  '</form>' +
'</div>' +
'<button type="button" class="bvc-btn" aria-expanded="false" aria-controls="bvc-panel">' +
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>' +
  '<span>Connect with us</span></button>';
document.body.appendChild(wrap);

var btn = wrap.querySelector(".bvc-btn");
var panel = wrap.querySelector(".bvc-panel");
var closeBtn = wrap.querySelector(".bvc-close");

function open() {
  panel.hidden = false; btn.setAttribute("aria-expanded", "true");
  document.getElementById("bvc-name").focus();
}
function close() {
  panel.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus();
}
btn.addEventListener("click", function () { panel.hidden ? open() : close(); });
closeBtn.addEventListener("click", close);
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) close(); });

// After FormSubmit redirects back with ?sent=1, show a short confirmation.
if (/[?&]sent=1\b/.test(location.search) && location.pathname !== "/faq/") {
  var note = document.createElement("div");
  note.className = "bvc-toast"; note.setAttribute("role", "status");
  note.textContent = "Thanks — your question is on its way. We'll reply within one business day.";
  wrap.appendChild(note);
  setTimeout(function () { note.remove(); }, 8000);
}

// Keep clear of the cookie banner while it's on screen.
function lift() {
  var banner = document.querySelector(".bv-cookie-banner");
  var r = banner && getComputedStyle(banner).display !== "none" ? banner.getBoundingClientRect() : null;
  var h = r && r.height > 0 ? r.height + 16 : 0;
  wrap.style.setProperty("--bvc-lift", h + "px");
}
new MutationObserver(lift).observe(document.body, { childList: true, subtree: false });
window.addEventListener("resize", lift);
lift();
})();
