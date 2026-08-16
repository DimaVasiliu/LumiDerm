/**
 * Lumi Derm — "add your birthday" capture page
 * ------------------------------------------------------------------
 * Tokenised link (?e=&t=) from the collect email. Saves the birthday
 * against the subscriber via /api/birthday/collect.
 */
(function () {
  "use strict";

  var form = document.querySelector("[data-collect-form]");
  var card = document.querySelector("[data-collect-card]");
  if (!form || !card) return;

  var params = new URLSearchParams(location.search);
  var email = params.get("e") || "";
  var token = params.get("t") || "";
  var status = form.querySelector("[data-collect-status]");

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var daySel = form.querySelector("[data-days]");
  var monthSel = form.querySelector("[data-months]");
  daySel.innerHTML = '<option value="">Day</option>' + Array.from({ length: 31 }, function (_, i) { return "<option>" + (i + 1) + "</option>"; }).join("");
  monthSel.innerHTML = '<option value="">Month</option>' + MONTHS.map(function (m, i) { return '<option value="' + (i + 1) + '">' + m + "</option>"; }).join("");

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  if (!email || !token) {
    status.textContent = "This link is missing its details — please use the button in your email.";
    status.className = "birthday-status is-error";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var day = daySel.value;
    var month = monthSel.value;
    if (!day || !month) { status.textContent = "Please choose your birth day and month."; status.className = "birthday-status is-error"; return; }
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    status.textContent = "Saving…";
    status.className = "birthday-status";
    fetch("/api/birthday/collect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email, token: token, birth_day: day, birth_month: month, company: form.company.value }),
    }).then(function (r) {
      return r.json().then(function (p) { if (!r.ok) throw new Error(p.error || "Something went wrong."); return p; });
    }).then(function (p) {
      card.innerHTML =
        '<p class="eyebrow">Thank you</p>' +
        '<h1 class="birthday-heading">Birthday saved</h1>' +
        '<div class="birthday-tick" aria-hidden="true">✓</div>' +
        "<p class=\"birthday-lead\">" + esc(p.message || "We’ve saved your birthday — look out for a treat when it comes around.") + "</p>" +
        '<p><a class="btn btn-secondary" href="/">Back to the website</a></p>';
    }).catch(function (err) {
      btn.disabled = false;
      status.textContent = err && err.message ? err.message : "Something went wrong. Please try again.";
      status.className = "birthday-status is-error";
    });
  });
})();
