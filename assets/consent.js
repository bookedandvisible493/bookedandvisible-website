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
* Self-contained on purpose: not every page that loads gtag.js is guaranteed
* to share the main assets/style.css system (e.g. the archive pages use an
* older stylesheet), so this injects its own scoped styles rather than
* relying on the host page's CSS.
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
"max-width:640px;margin:0 auto;background:var(--paper,#fcfcfb);color:var(--ink,#141413);padding:20px 24px;" +
"border:1.5px solid var(--line,#dcdcd8);border-radius:12px;box-shadow:0 12px 32px rgba(20,20,19,.14);display:flex;flex-wrap:wrap;" +
"gap:16px;align-items:center;justify-content:space-between;" +
"font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}" +
".bv-cookie-banner p{margin:0;font-size:13px;line-height:1.5;color:var(--muted,#5b5b57);flex:1;min-width:220px;}" +
".bv-cookie-banner a{color:var(--accent-dark,#1a4fc0);text-decoration:underline;}" +
".bv-cookie-actions{display:flex;gap:10px;flex-shrink:0;}" +
".bv-cookie-actions button{min-height:44px;padding:10px 18px;font-size:13px;font-weight:700;border-radius:6px;" +
"border:none;cursor:pointer;font-family:inherit;}" +
".bv-cookie-decline{background:transparent;color:var(--ink,#141413);box-shadow:inset 0 0 0 1.5px var(--line,#cfcfca);}" +
".bv-cookie-accept{background:var(--accent,#1f5fe0);color:#fff;}" +
".bv-cookie-actions button:focus-visible{outline:3px solid var(--accent,#1f5fe0);outline-offset:2px;}" +
"@media (max-width:480px){.bv-cookie-banner{flex-direction:column;align-items:stretch;}" +
".bv-cookie-actions{justify-content:flex-end;}}";
document.head.appendChild(style);
}

function removeBanner() {
var el = document.querySelector(".bv-cookie-banner");
if (el && el.parentNode) el.parentNode.removeChild(el);
}

var L18 = {
ko: ["쿠키 동의", "저희는 방문자가 이 사이트를 어떻게 이용하는지 파악하기 위해 쿠키를 사용합니다. 분석 쿠키는 수락하거나 거부하실 수 있으며, 어느 쪽을 선택하셔도 사이트는 동일하게 작동합니다. <a href=\"/privacy.html\">개인정보 처리방침</a>(영문)을 확인해 주세요.", "거부", "수락"],
zh: ["Cookie 同意", "我們使用 Cookie 來了解訪客如何使用本網站。您可以接受或拒絕分析類 Cookie，無論選擇哪一種，網站的運作都相同。請參閱我們的<a href=\"/privacy.html\">隱私權政策</a>（英文）。", "拒絕", "接受"],
es: ["Consentimiento de cookies", "Usamos cookies para entender cómo los visitantes usan este sitio. Puede aceptar o rechazar las cookies de análisis; el sitio funciona igual en ambos casos. Consulte nuestra <a href=\"/privacy.html\">Política de privacidad</a> (en inglés).", "Rechazar", "Aceptar"],
ja: ["Cookieの同意", "当サイトでは、訪問者がサイトをどのように利用しているかを把握するためにCookieを使用します。分析用Cookieは承諾または拒否を選択でき、どちらを選んでもサイトの動作は変わりません。<a href=\"/privacy.html\">プライバシーポリシー</a>（英語）をご確認ください。", "拒否", "承諾"],
ru: ["Согласие на использование cookie", "Мы используем файлы cookie, чтобы понимать, как посетители пользуются сайтом. Вы можете принять или отклонить аналитические cookie — сайт работает одинаково в обоих случаях. Подробнее — в нашей <a href=\"/privacy.html\">Политике конфиденциальности</a> (на английском).", "Отклонить", "Принять"],
fr: ["Consentement aux témoins", "Nous utilisons des témoins (cookies) pour comprendre comment les visiteurs utilisent ce site. Vous pouvez accepter ou refuser les témoins d'analyse : le site fonctionne de la même façon dans les deux cas. Consultez notre <a href=\"/privacy.html\">Politique de confidentialité</a> (en anglais).", "Refuser", "Accepter"],
pt: ["Consentimento de cookies", "Usamos cookies para entender como os visitantes usam este site. Você pode aceitar ou recusar os cookies de análise; o site funciona da mesma forma nos dois casos. Veja nossa <a href=\"/privacy.html\">Política de Privacidade</a> (em inglês).", "Recusar", "Aceitar"]
};
function pageLang() {
var l = (document.documentElement.lang || "en").toLowerCase();
return l.indexOf("zh") === 0 ? "zh" : l.slice(0, 2);
}
function showBanner() {
if (document.querySelector(".bv-cookie-banner")) return;
injectStyles();

var banner = document.createElement("div");
banner.className = "bv-cookie-banner";
banner.setAttribute("data-nosnippet", "");
banner.setAttribute("role", "dialog");
var T = L18[pageLang()] || ["Cookie consent", 'We use cookies to understand how visitors use this site. You can accept or decline analytics cookies — the site works the same either way. See our <a href="/privacy.html">Privacy Policy</a>.', "Decline", "Accept"];
banner.setAttribute("aria-label", T[0]);
banner.innerHTML =
"<p>" + T[1] + "</p>" +
'<div class="bv-cookie-actions">' +
'<button type="button" class="bv-cookie-decline">' + T[2] + '</button>' +
'<button type="button" class="bv-cookie-accept">' + T[3] + '</button>' +
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
