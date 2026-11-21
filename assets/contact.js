/*
 * Site-wide "Connect with us" button (bottom-right) with a short question
 * form. Submissions go to hello@ through FormSubmit, the same backend as the
 * FAQ form, so the order operator picks them up as support questions.
 * The button lifts itself above the cookie banner while that is showing.
 */
(function () {
"use strict";
if (document.getElementById("bv-contact")) return;

var L18 = {
ko: {title:"무엇이든 문의하세요", sub:"Victor가 영업일 기준 1일 이내에 직접 답변드립니다(답변은 영어로 보내드립니다). 한국어로 문의하셔도 됩니다.", name:"이름", email:"이메일", q:"문의 내용", send:"질문 보내기", fine:'보내시면 <a href="/privacy.html">개인정보 처리방침</a>(영문)에 동의하신 것으로 간주합니다.', btn:"문의하기", thanks:"감사합니다. 문의가 접수되었습니다. 영업일 기준 1일 이내에 답변드리겠습니다.", close:"닫기"},
zh: {title:"有任何問題歡迎詢問", sub:"Victor 會在一個工作天內親自回覆（以英文回覆）。歡迎用中文提問。", name:"您的姓名", email:"電子郵件", q:"您的問題", send:"送出問題", fine:'送出即表示您同意我們的<a href="/privacy.html">隱私權政策</a>（英文）。', btn:"聯絡我們", thanks:"謝謝，您的問題已送出。我們會在一個工作天內回覆。", close:"關閉"},
es: {title:"Pregúntenos lo que quiera", sub:"Victor responde personalmente en un día hábil (en inglés). Puede escribirnos en español.", name:"Su nombre", email:"Correo electrónico", q:"Su pregunta", send:"Enviar pregunta", fine:'Al enviar, acepta nuestra <a href="/privacy.html">Política de privacidad</a> (en inglés).', btn:"Contáctenos", thanks:"Gracias, su pregunta va en camino. Responderemos en un día hábil.", close:"Cerrar"},
ja: {title:"お気軽にご質問ください", sub:"Victorが1営業日以内に直接お返事します（返信は英語です）。日本語でのご質問も可能です。", name:"お名前", email:"メールアドレス", q:"ご質問", send:"質問を送信", fine:'送信すると、<a href="/privacy.html">プライバシーポリシー</a>（英語）に同意したものとみなされます。', btn:"お問い合わせ", thanks:"ありがとうございます。ご質問を受け付けました。1営業日以内にご返信します。", close:"閉じる"},
ru: {title:"Задайте нам любой вопрос", sub:"Victor лично отвечает в течение одного рабочего дня (ответ — на английском). Писать можно по-русски.", name:"Ваше имя", email:"Эл. почта", q:"Ваш вопрос", send:"Отправить вопрос", fine:'Отправляя форму, вы соглашаетесь с нашей <a href="/privacy.html">Политикой конфиденциальности</a> (на английском).', btn:"Связаться с нами", thanks:"Спасибо, ваш вопрос отправлен. Мы ответим в течение одного рабочего дня.", close:"Закрыть"},
fr: {title:"Posez-nous vos questions", sub:"Victor répond personnellement en un jour ouvrable (en anglais). Vous pouvez nous écrire en français.", name:"Votre nom", email:"Courriel", q:"Votre question", send:"Envoyer la question", fine:'En envoyant ce formulaire, vous acceptez notre <a href="/privacy.html">Politique de confidentialité</a> (en anglais).', btn:"Nous joindre", thanks:"Merci, votre question est en route. Nous répondrons en un jour ouvrable.", close:"Fermer"},
pt: {title:"Pergunte o que quiser", sub:"Victor responde pessoalmente em até um dia útil (em inglês). Você pode escrever em português.", name:"Seu nome", email:"E-mail", q:"Sua pergunta", send:"Enviar pergunta", fine:'Ao enviar, você concorda com nossa <a href="/privacy.html">Política de Privacidade</a> (em inglês).', btn:"Fale conosco", thanks:"Obrigado, sua pergunta está a caminho. Responderemos em até um dia útil.", close:"Fechar"}
};
var pl = (document.documentElement.lang || "en").toLowerCase();
var T = L18[pl.indexOf("zh") === 0 ? "zh" : pl.slice(0, 2)] || {title:"Ask us anything", sub:"Victor replies personally within one business day.", name:"Your name", email:"Email", q:"Your question", send:"Send question", fine:'By sending, you agree to our <a href="/privacy.html">Privacy Policy</a>.', btn:"Connect with us", thanks:"Thanks — your question is on its way. We'll reply within one business day.", close:"Close"};
var here = location.origin + location.pathname;
var wrap = document.createElement("div");
wrap.id = "bv-contact";
wrap.setAttribute("data-nosnippet", "");
wrap.innerHTML =
'<div class="bvc-panel" id="bvc-panel" role="dialog" aria-modal="false" aria-labelledby="bvc-title" hidden>' +
  '<div class="bvc-head"><h2 id="bvc-title">' + T.title + '</h2>' +
  '<button type="button" class="bvc-close" aria-label="' + T.close + '">&times;</button></div>' +
  '<p class="bvc-sub">' + T.sub + '</p>' +
  '<form class="bvc-form" action="https://formsubmit.co/hello@bookedandvisible.ca" method="POST">' +
    '<input type="hidden" name="_subject" value="New question from bookedandvisible.ca">' +
    '<input type="hidden" name="_template" value="table">' +
    '<input type="hidden" name="_captcha" value="true">' +
    '<input type="hidden" name="_next" value="' + here + '?sent=1">' +
    '<input type="hidden" name="Page" value="' + location.pathname + '">' +
    '<input type="text" name="_honey" class="bvc-honey" tabindex="-1" autocomplete="off" aria-hidden="true">' +
    '<label for="bvc-name">' + T.name + '</label><input id="bvc-name" type="text" name="name" autocomplete="name" required>' +
    '<label for="bvc-email">' + T.email + '</label><input id="bvc-email" type="email" name="email" autocomplete="email" required>' +
    '<label for="bvc-q">' + T.q + '</label><textarea id="bvc-q" name="Question" rows="4" required></textarea>' +
    '<button type="submit" class="bvc-send">' + T.send + '</button>' +
    '<p class="bvc-fine">' + T.fine + '</p>' +
  '</form>' +
'</div>' +
'<button type="button" class="bvc-btn" aria-expanded="false" aria-controls="bvc-panel">' +
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>' +
  '<span>' + T.btn + '</span></button>';
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
  note.textContent = T.thanks;
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
