/**
 * Lumi Derm — newsletter signup popup (double opt-in)
 * ------------------------------------------------------------------
 * A gentle slide-in that appears once per visitor. GDPR-friendly:
 * consent is an unticked box, the privacy notice is linked, it never
 * blocks the page, and it's easy to dismiss. Submits to /api/subscribe;
 * the visitor then gets a confirmation email (double opt-in).
 */
(function () {
  "use strict";

  var SEEN_KEY = "lumiSignupSeen";
  var DONE_KEY = "lumiSubscribed";
  var DELAY_MS = 18000; // show after ~18s of engaged browsing
  var CONSENT_WORDING =
    "Yes, email me Lumi Derm Aesthetics offers and news. I understand I can unsubscribe at any time.";

  function stored(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function remember(key) {
    try { localStorage.setItem(key, "1"); } catch (e) { /* ignore */ }
  }

  // Respect reduced motion for the slide-in.
  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var MONTHS = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];

  function buildDayOptions() {
    var out = '<option value="">Day</option>';
    for (var d = 1; d <= 31; d += 1) out += '<option value="' + d + '">' + d + '</option>';
    return out;
  }
  function buildMonthOptions() {
    var out = '<option value="">Month</option>';
    for (var m = 0; m < 12; m += 1) out += '<option value="' + (m + 1) + '">' + MONTHS[m] + '</option>';
    return out;
  }

  function render() {
    var wrap = document.createElement("div");
    wrap.className = "signup-pop";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "Join the Lumi Derm mailing list");
    wrap.innerHTML =
      '<button class="signup-pop-close" type="button" aria-label="Close">&times;</button>' +
      '<div class="signup-pop-body" data-signup-body>' +
        '<p class="signup-pop-eyebrow">Lumi Derm Aesthetics</p>' +
        '<h3 class="signup-pop-title">Be first to know</h3>' +
        '<p class="signup-pop-lead">Offers, new treatments and the occasional skin tip &mdash; straight to your inbox. No spam, unsubscribe anytime.</p>' +
        '<form class="signup-pop-form" data-signup-form novalidate>' +
          // honeypot (hidden from people, catches bots)
          '<input class="signup-pop-hp" type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<div class="signup-row">' +
            '<label>First name*<input type="text" name="first_name" required autocomplete="given-name"></label>' +
            '<label>Last name<input type="text" name="last_name" autocomplete="family-name"></label>' +
          '</div>' +
          '<label>Email*<input type="email" name="email" required autocomplete="email" inputmode="email"></label>' +
          '<div class="signup-row">' +
            '<label>Birthday<select name="birth_day">' + buildDayOptions() + '</select></label>' +
            '<label><span class="signup-hide">Birth month</span><select name="birth_month">' + buildMonthOptions() + '</select></label>' +
          '</div>' +
          '<label>I\'m interested in<select name="interest">' +
            '<option value="">Choose (optional)</option>' +
            '<option>Laser hair removal</option>' +
            '<option>Skin &amp; boosters</option>' +
            '<option>Facials &amp; peels</option>' +
            '<option>Body &amp; contouring</option>' +
            '<option>Lashes &amp; brows</option>' +
            '<option>Not sure yet</option>' +
          '</select></label>' +
          '<label class="signup-consent">' +
            '<input type="checkbox" name="consent_email" value="1">' +
            '<span>Yes, email me offers and news. I can unsubscribe anytime. See our <a href="pages/privacy.html" target="_blank" rel="noopener">privacy notice</a>.</span>' +
          '</label>' +
          '<button class="signup-pop-submit" type="submit">Join the list</button>' +
          '<p class="signup-pop-status" data-signup-status role="status"></p>' +
        '</form>' +
      '</div>';
    document.body.appendChild(wrap);
    bind(wrap);
    requestAnimationFrame(function () { wrap.classList.add("is-open"); });
    return wrap;
  }

  function fixPrivacyLink(wrap) {
    // On sub-pages the privacy notice sits at ../pages/privacy.html
    var path = location.pathname;
    if (path.indexOf("/pages/") !== -1) {
      var link = wrap.querySelector('a[href="pages/privacy.html"]');
      if (link) link.setAttribute("href", "privacy.html");
    }
  }

  function close(wrap) {
    wrap.classList.remove("is-open");
    remember(SEEN_KEY);
    window.setTimeout(function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }, reduceMotion ? 0 : 400);
  }

  function bind(wrap) {
    fixPrivacyLink(wrap);
    var form = wrap.querySelector("[data-signup-form]");
    var statusEl = wrap.querySelector("[data-signup-status]");
    var closeBtn = wrap.querySelector(".signup-pop-close");

    closeBtn.addEventListener("click", function () { close(wrap); });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape" && wrap.parentNode) { close(wrap); document.removeEventListener("keydown", onEsc); }
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      statusEl.className = "signup-pop-status";
      var data = {
        first_name: form.first_name.value.trim(),
        last_name: form.last_name.value.trim(),
        email: form.email.value.trim(),
        birth_day: form.birth_day.value,
        birth_month: form.birth_month.value,
        interest: form.interest.value,
        consent_email: form.consent_email.checked,
        consent_wording: CONSENT_WORDING,
        source: "website popup",
        company: form.company.value // honeypot
      };
      if (!data.first_name) { fail(statusEl, "Please enter your first name."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) { fail(statusEl, "Please enter a valid email."); return; }
      if (!data.consent_email) { fail(statusEl, "Please tick the box to receive emails."); return; }

      var submitBtn = form.querySelector(".signup-pop-submit");
      submitBtn.disabled = true;
      statusEl.textContent = "Sending…";

      fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data)
      }).then(function (res) {
        return res.json().then(function (payload) {
          if (!res.ok) throw new Error(payload.error || "Something went wrong.");
          return payload;
        });
      }).then(function (payload) {
        remember(DONE_KEY);
        remember(SEEN_KEY);
        showSuccess(wrap, payload.already);
      }).catch(function (err) {
        submitBtn.disabled = false;
        fail(statusEl, err.message);
      });
    });
  }

  function fail(statusEl, msg) {
    statusEl.textContent = msg;
    statusEl.className = "signup-pop-status is-error";
  }

  function showSuccess(wrap, already) {
    var body = wrap.querySelector("[data-signup-body]");
    body.innerHTML =
      '<div class="signup-pop-done">' +
        '<div class="signup-pop-tick" aria-hidden="true">&#10003;</div>' +
        '<h3 class="signup-pop-title">' + (already ? "You're already in" : "Almost there!") + '</h3>' +
        '<p class="signup-pop-lead">' +
          (already
            ? "You're already on our list — lovely to have you."
            : "We've sent you a confirmation email. Click the link inside to finish joining the list.") +
        '</p>' +
        '<button class="signup-pop-submit" type="button" data-signup-dismiss>Close</button>' +
      '</div>';
    var dismiss = body.querySelector("[data-signup-dismiss]");
    if (dismiss) dismiss.addEventListener("click", function () { close(wrap); });
  }

  function maybeShow() {
    if (stored(DONE_KEY) || stored(SEEN_KEY)) return;
    if (!document.body) return;
    window.setTimeout(function () {
      if (!stored(DONE_KEY) && !stored(SEEN_KEY)) render();
    }, DELAY_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", maybeShow);
  } else {
    maybeShow();
  }
})();
