/*
* Cookie consent banner for pages that load Google Analytics (gtag.js) and
* the Meta Pixel. Works with the Google Consent Mode v2 defaults set inline
* in <head> (analytics_storage etc. start denied), and applies the same
* default-denied / update-on-choice pattern to the Meta Pixel via its own
* consent API (fbq('consent', 'revoke'|'grant')). This script:
* 1. On return visits, replays the visitor's stored choice via
* gtag('consent','update', ...) and fbq('consent', ...) so both
* Analytics and the Pixel keep respecting it.
* 2. On a first visit, shows a small banner asking to accept or decline.
* 3. Exposes a way to reopen the banner later (any element with a
* data-cookie-preferences attribute) so a choice can be changed.
*
* Self-contained on purpose: the pages that currently load gtag.js don't
* share one CSS system (privacy.html/terms.html/refund-policy.html use
* their own inline navy/amber styles; the archive pages use an older
* stylesheet), so this injects its own scoped styles rather than relying
* on assets/style.css.
*/
(function () {
"use strict";

var STORAGE_KEY = "bv_cookie_consent"; // "granted" | "denied"
var PREF_ATTR = "data-cookie-preferences";
var META_PIXEL_ID = "2053523891918028";

function initMetaPixel() {
if (window.fbq) return;
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
// Default to revoked, matching Consent Mode's default-denied posture.
// No events are actually sent to Meta until fbq('consent','grant') runs.
window.fbq('consent', 'revoke');
window.fbq('init', META_PIXEL_ID);
window.fbq('track', 'PageView');
}

function pushConsent(value) {
if (typeof window.gtag === "function") {
window.gtag("consent", "update", {
analytics_storage: value,
ad_storage: value,
ad_user_data: value,
ad_personalization: value
});
}
if (typeof window.fbq === "function") {
window.fbq("consent", value === "granted" ? "grant" : "revoke");
}
}

function getStored() {
try {
return window.localStorage.getItem(STORAGE_KEY);
} catch (e) {
return null;
}
}

function setStored(value) {
try {
window.localStorage.setItem(STORAGE_KEY, value);
} catch (e) {
/* private-browsing / storage disabled — consent still applies for this page view */
}
}

function injectStyles() {
if (document.getElementById("bv-cookie-consent-style")) return;
var style = document.createElement("style");
style.id = "bv-cookie-consent-style";
style.textContent =
".bv-cookie-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;" +
"max-width:640px;margin:0 auto;background:#14181f;color:#fff;padding:20px 24px;" +
"border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.28);display:flex;flex-wrap:wrap;" +
"gap:16px;align-items:center;justify-content:space-between;" +
"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}" +
".bv-cookie-banner p{margin:0;font-size:13px;line-height:1.5;color:rgba(255,255,255,.85);flex:1;min-width:220px;}" +
".bv-cookie-banner a{color:#9fc4ff;text-decoration:underline;}" +
".bv-cookie-actions{display:flex;gap:10px;flex-shrink:0;}" +
".bv-cookie-actions button{padding:10px 18px;font-size:13px;font-weight:700;border-radius:4px;" +
"border:none;cursor:pointer;font-family:inherit;}" +
".bv-cookie-decline{background:transparent;color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.4);}" +
".bv-cookie-accept{background:#3b7cf0;color:#fff;}" +
"@media (max-width:480px){.bv-cookie-banner{flex-direction:column;align-items:stretch;}" +
".bv-cookie-actions{justify-content:flex-end;}}";
document.head.appendChild(style);
}

function removeBanner() {
var el = document.querySelector(".bv-cookie-banner");
if (el && el.parentNode) el.parentNode.removeChild(el);
}

function showBanner() {
if (document.querySelector(".bv-cookie-banner")) return;
injectStyles();

var banner = document.createElement("div");
banner.className = "bv-cookie-banner";
banner.setAttribute("role", "dialog");
banner.setAttribute("aria-label", "Cookie consent");
banner.innerHTML =
"<p>We use cookies to understand how visitors use this site. You can accept or decline " +
'analytics cookies — the site works the same either way. See our <a href="/privacy.html">Privacy Policy</a>.</p>' +
'<div class="bv-cookie-actions">' +
'<button type="button" class="bv-cookie-decline">Decline</button>' +
'<button type="button" class="bv-cookie-accept">Accept</button>' +
"</div>";
document.body.appendChild(banner);

banner.querySelector(".bv-cookie-accept").addEventListener("click", function () {
setStored("granted");
pushConsent("granted");
removeBanner();
});
banner.querySelector(".bv-cookie-decline").addEventListener("click", function () {
setStored("denied");
pushConsent("denied");
removeBanner();
});
}

function init() {
initMetaPixel();
var stored = getStored();
if (stored === "granted" || stored === "denied") {
pushConsent(stored);
} else {
showBanner();
}
}

if (document.readyState === "loading") {
document.addEventListener("DOMContentLoaded", init);
} else {
init();
}

// Any link/button with data-cookie-preferences reopens the banner so a
// visitor can change an earlier choice (e.g. a "Cookie Preferences" footer link).
document.addEventListener("click", function (e) {
var target = e.target.closest ? e.target.closest("[" + PREF_ATTR + "]") : null;
if (!target) return;
e.preventDefault();
showBanner();
});
})();
