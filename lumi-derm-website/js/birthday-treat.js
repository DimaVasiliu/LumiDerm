/**
 * Lumi Derm — birthday treat redemption page
 * ------------------------------------------------------------------
 * Reads the ?t= token, validates the voucher, and shows the code + a
 * venue-only appointment path (WhatsApp / call / request form). Never
 * links to Treatwell.
 */
(function () {
  "use strict";

  var card = document.querySelector("[data-birthday-card]");
  if (!card) return;
  var WHATSAPP = "447832839298";
  var token = new URLSearchParams(location.search).get("t") || "";

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  function renderError(title, msg) {
    card.innerHTML =
      '<p class="eyebrow">Birthday treat</p>' +
      '<h1 class="birthday-heading">' + esc(title) + '</h1>' +
      '<p class="birthday-lead">' + esc(msg) + '</p>' +
      '<p class="birthday-fallback">Call or WhatsApp <a href="tel:07832839298">07832&nbsp;839298</a>, or email <a href="mailto:info@lumidermaesthetics.co.uk">info@lumidermaesthetics.co.uk</a>.</p>' +
      '<p><a class="btn btn-secondary" href="/">Back to the website</a></p>';
  }

  function renderVoucher(v) {
    var waText = encodeURIComponent("Hi Lumi Derm! I'd like to book my birthday treat. My code is " + v.code + ".");
    card.innerHTML =
      '<p class="eyebrow">Happy birthday' + (v.name ? ", " + esc(v.name) : "") + "!</p>" +
      '<h1 class="birthday-heading">' + esc(v.discount) + "% off one treatment</h1>" +
      '<div class="birthday-code"><span>Your code</span><strong>' + esc(v.code) + "</strong><small>Valid until " + esc(v.expires) + "</small></div>" +
      '<p class="birthday-note">Redeemed and paid for at the studio only. <strong>Not valid for Treatwell bookings.</strong></p>' +
      '<div class="birthday-actions">' +
        '<a class="btn btn-primary" href="https://wa.me/' + WHATSAPP + "?text=" + waText + '" target="_blank" rel="noopener">Book on WhatsApp</a>' +
        '<a class="btn btn-secondary" href="tel:07832839298">Call the studio</a>' +
      "</div>" +
      '<form class="birthday-form" data-bday-form novalidate>' +
        '<h2 class="birthday-form-title">Or request an appointment</h2>' +
        '<input type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true" class="birthday-hp">' +
        "<label>Treatment you’d like<input type=\"text\" name=\"treatment\" maxlength=\"120\" placeholder=\"e.g. facial, laser, skin boosters\"></label>" +
        "<label>Preferred days / times<input type=\"text\" name=\"times\" maxlength=\"300\" placeholder=\"e.g. weekday evenings, Sat mornings\"></label>" +
        "<label>Phone<input type=\"tel\" name=\"phone\" maxlength=\"40\" autocomplete=\"tel\"></label>" +
        "<label>Anything else?<textarea name=\"message\" rows=\"3\" maxlength=\"1000\"></textarea></label>" +
        '<button class="btn btn-primary" type="submit">Send request</button>' +
        '<p class="birthday-status" data-bday-status role="status" aria-live="polite"></p>' +
      "</form>";

    var form = card.querySelector("[data-bday-form]");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = form.querySelector("[data-bday-status]");
      var data = {
        token: token,
        treatment: form.treatment.value.trim(),
        times: form.times.value.trim(),
        phone: form.phone.value.trim(),
        message: form.message.value.trim(),
        company: form.company.value,
      };
      if (!data.phone && !data.message) {
        status.textContent = "Please add a phone number or a short message so we can reach you.";
        status.className = "birthday-status is-error";
        return;
      }
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      status.textContent = "Sending…";
      status.className = "birthday-status";
      fetch("/api/birthday/request", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data),
      }).then(function (r) {
        return r.json().then(function (p) { if (!r.ok) throw new Error(p.error || "Something went wrong."); return p; });
      }).then(function (p) {
        form.innerHTML =
          '<div class="birthday-done"><div class="birthday-tick" aria-hidden="true">✓</div>' +
          "<h2>Request sent</h2><p>" + esc(p.message || "We’ll be in touch to confirm your time.") + "</p>" +
          '<p class="birthday-note">Show code <strong>' + esc(v.code) + "</strong> at your visit and pay in the studio.</p></div>";
      }).catch(function (err) {
        btn.disabled = false;
        status.textContent = err && err.message ? err.message : "Something went wrong. Please try again.";
        status.className = "birthday-status is-error";
      });
    });
  }

  if (!token) {
    renderError("Birthday treat", "This link is missing its code. Please open the button in your birthday email.");
    return;
  }
  fetch("/api/birthday/voucher?t=" + encodeURIComponent(token))
    .then(function (r) { return r.json().then(function (p) { return p; }); })
    .then(function (p) {
      if (p && (p.status === "active" || p.status === "requested")) return renderVoucher(p);
      if (p && p.status === "expired") return renderError("This offer has expired", "Your birthday treat was valid for 30 days and has now expired. Do get in touch — we’d still love to see you.");
      if (p && p.status === "redeemed") return renderError("Already redeemed", "This birthday code has already been used. If that’s not right, let us know.");
      if (p && p.status === "cancelled") return renderError("Not available", "This birthday code is no longer active. Please contact us.");
      return renderError("We couldn’t find that code", "This birthday link doesn’t look valid. Please open the button in your birthday email.");
    })
    .catch(function () {
      renderError("Something went wrong", "We couldn’t load your birthday treat just now. Please try again shortly.");
    });
})();
