/*
* Order intake form (/order/): shows only the sections that apply to the
* product the customer bought.
*
* Any element with data-show="report boost ..." is visible only when the
* selected product is in that list. Inputs marked data-required become
* required only while visible, and hidden inputs are disabled so they are
* neither validated nor included in the emailed submission.
*
* The product can be preselected from the link, e.g. /order/?product=seo,
* so each payment link can redirect straight to the right version of the form.
*/
(function () {
"use strict";

var form = document.getElementById("order-form");
if (!form) return;
var select = document.getElementById("product");

function update() {
var opt = select.options[select.selectedIndex];
var product = (opt && opt.getAttribute("data-key")) || "";
var sections = form.querySelectorAll("[data-show]");
for (var i = 0; i < sections.length; i++) {
var el = sections[i];
var list = el.getAttribute("data-show").split(" ");
// A nested section is visible only if its parent section is too.
var parent = el.parentElement.closest("[data-show]");
var visible = product !== "" && list.indexOf(product) !== -1 &&
(!parent || parent.getAttribute("data-show").split(" ").indexOf(product) !== -1);
el.hidden = !visible;
var inputs = el.querySelectorAll("input, select, textarea");
for (var j = 0; j < inputs.length; j++) {
inputs[j].disabled = !visible;
if (inputs[j].hasAttribute("data-required")) inputs[j].required = visible;
}
}
}

var fromLink = new URLSearchParams(window.location.search).get("product");
var linked = fromLink && select.querySelector('option[data-key="' + fromLink + '"]');
if (linked) linked.selected = true;

// Stripe payment links redirect here with ?session_id=cs_..., which
// identifies the payment exactly, so the customer doesn't need to type a
// receipt reference.
var session = new URLSearchParams(window.location.search).get("session_id");
if (session && /^cs_[A-Za-z0-9_]+$/.test(session)) {
document.getElementById("stripe-session").value = session;
var refField = document.getElementById("payment-ref-field");
refField.hidden = true;
var ref = document.getElementById("payment-ref");
ref.required = false;
ref.disabled = true;
}

select.addEventListener("change", update);
update();
})();
