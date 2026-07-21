/**
 * Lumi Derm — newsletter signup (double opt-in)
 * ------------------------------------------------------------------
 * One reusable, centred modal + a slim cookie-style banner.
 *  - Homepage: the modal opens gently, once per visitor.
 *  - Booking & treatments pages: a slim banner invites people to join
 *    (highest intent) and opens the same modal. Never blocks booking.
 *  - Any element with [data-signup-open] opens the modal too.
 * GDPR-friendly: unticked consent, privacy notice linked, easy to
 * dismiss. Submits to /api/subscribe → double opt-in email.
 */
(function () {
  "use strict";

  var SEEN_KEY = "lumiSignupSeen";     // dismissed the prompt
  var DONE_KEY = "lumiSubscribed";     // completed signup
  var DELAY_MS = 15000;                // homepage: show after ~15s
  // MUST match the visible checkbox label below, word for word — ICO requires the
  // consent record to show exactly "what they were told".
  var CONSENT_WORDING =
    "Yes, email me offers and news. I can unsubscribe anytime. See our privacy notice.";

  var MONTHS = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];

  function stored(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function remember(k) { try { localStorage.setItem(k, "1"); } catch (e) {} }
  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function dayOptions() {
    var o = '<option value="">Day</option>';
    for (var d = 1; d <= 31; d += 1) o += '<option value="' + d + '">' + d + "</option>";
    return o;
  }
  function monthOptions() {
    var o = '<option value="">Month</option>';
    for (var m = 0; m < 12; m += 1) o += '<option value="' + (m + 1) + '">' + MONTHS[m] + "</option>";
    return o;
  }

  var modalEl = null;

  function buildModal() {
    var back = document.createElement("div");
    back.className = "signup-modal";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    back.setAttribute("aria-label", "Join the Lumi Derm mailing list");
    back.innerHTML =
      '<div class="signup-modal-veil" data-signup-close></div>' +
      '<div class="signup-card">' +
        '<button class="signup-close" type="button" data-signup-close aria-label="Close">&times;</button>' +
        '<div class="signup-body" data-signup-body>' +
          '<p class="signup-eyebrow">Lumi Derm Aesthetics</p>' +
          '<h3 class="signup-title">Be first to know</h3>' +
          '<p class="signup-lead">Offers, new treatments and the occasional skin tip &mdash; straight to your inbox. No spam, unsubscribe anytime.</p>' +
          '<form class="signup-form" data-signup-form novalidate>' +
            '<input class="signup-hp" type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">' +
            '<div class="signup-row">' +
              '<label>First name*<input type="text" name="first_name" required autocomplete="given-name"></label>' +
              '<label>Last name<input type="text" name="last_name" autocomplete="family-name"></label>' +
            '</div>' +
            '<label>Email*<input type="email" name="email" required autocomplete="email" inputmode="email"></label>' +
            '<div class="signup-field">' +
              '<span class="signup-field-label">Birthday <em>(optional)</em></span>' +
              '<div class="signup-row">' +
                '<select name="birth_day" aria-label="Birth day">' + dayOptions() + '</select>' +
                '<select name="birth_month" aria-label="Birth month">' + monthOptions() + '</select>' +
              '</div>' +
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
              '<span>Yes, email me offers and news. I can unsubscribe anytime. See our <a href="pages/privacy.html" target="_blank" rel="noopener" data-signup-privacy>privacy notice</a>.</span>' +
            '</label>' +
            '<button class="signup-submit" type="submit">Join the list</button>' +
            '<p class="signup-status" data-signup-status role="status"></p>' +
          '</form>' +
        '</div>' +
      '</div>';
    document.body.appendChild(back);
    bindModal(back);
    return back;
  }

  function fixPrivacyLink(root) {
    if (location.pathname.indexOf("/pages/") !== -1) {
      var link = root.querySelector("[data-signup-privacy]");
      if (link) link.setAttribute("href", "privacy.html");
    }
  }

  var lastFocus = null;
  function openModal() {
    if (stored(DONE_KEY)) return; // already subscribed — don't nag
    if (!modalEl) modalEl = buildModal();
    lastFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    modalEl.style.display = "flex";
    requestAnimationFrame(function () { modalEl.classList.add("is-open"); });
    var first = modalEl.querySelector('input[name="first_name"]');
    if (first) setTimeout(function () { try { first.focus(); } catch (e) {} }, 60);
  }
  function closeModal() {
    if (!modalEl) return;
    modalEl.classList.remove("is-open");
    document.body.style.overflow = "";
    remember(SEEN_KEY);
    var done = function () {
      modalEl.style.display = "none";
      modalEl.removeEventListener("transitionend", done);
    };
    if (reduceMotion) done(); else modalEl.addEventListener("transitionend", done);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  function bindModal(root) {
    fixPrivacyLink(root);
    Array.prototype.forEach.call(root.querySelectorAll("[data-signup-close]"), function (el) {
      el.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && root.classList.contains("is-open")) closeModal();
    });
    var form = root.querySelector("[data-signup-form]");
    var statusEl = root.querySelector("[data-signup-status]");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      statusEl.className = "signup-status";
      var data = {
        first_name: form.first_name.value.trim(),
        last_name: form.last_name.value.trim(),
        email: form.email.value.trim(),
        birth_day: form.birth_day.value,
        birth_month: form.birth_month.value,
        interest: form.interest.value,
        consent_email: form.consent_email.checked,
        consent_wording: CONSENT_WORDING,
        source: "website " + pageTag(),
        company: form.company.value
      };
      if (!data.first_name) return fail(statusEl, "Please enter your first name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) return fail(statusEl, "Please enter a valid email.");
      if (!data.consent_email) return fail(statusEl, "Please tick the box to receive emails.");

      var btn = form.querySelector(".signup-submit");
      btn.disabled = true;
      statusEl.textContent = "Sending…";
      fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data)
      }).then(function (res) {
        return res.json().then(function (p) { if (!res.ok) throw new Error(p.error || "Something went wrong."); return p; });
      }).then(function (p) {
        remember(DONE_KEY); remember(SEEN_KEY);
        success(root, p.already);
        hideBanner();
      }).catch(function (err) { btn.disabled = false; fail(statusEl, err.message); });
    });
  }

  function fail(el, msg) { el.textContent = msg; el.className = "signup-status is-error"; }

  function success(root, already) {
    var body = root.querySelector("[data-signup-body]");
    body.innerHTML =
      '<div class="signup-done">' +
        '<div class="signup-tick" aria-hidden="true">&#10003;</div>' +
        '<h3 class="signup-title">' + (already ? "You're already in" : "Almost there!") + "</h3>" +
        '<p class="signup-lead">' +
          (already
            ? "You're already on our list — lovely to have you."
            : "We've sent you a confirmation email. Click the link inside to finish joining the list.") +
        "</p>" +
        '<button class="signup-submit" type="button" data-signup-close>Done</button>' +
      "</div>";
    body.querySelector("[data-signup-close]").addEventListener("click", closeModal);
  }

  /* ---- Slim banner (booking / treatments pages) ---- */
  var bannerEl = null;
  function buildBanner() {
    var b = document.createElement("div");
    b.className = "signup-banner";
    b.innerHTML =
      '<p class="signup-banner-text">Be first to know about our <strong>offers &amp; new treatments</strong> &mdash; join our mailing list.</p>' +
      '<div class="signup-banner-actions">' +
        '<button class="signup-banner-join" type="button" data-signup-open>Join the list</button>' +
        '<button class="signup-banner-no" type="button" data-signup-bannerclose>No thanks</button>' +
      "</div>";
    document.body.appendChild(b);
    b.querySelector("[data-signup-bannerclose]").addEventListener("click", function () {
      remember(SEEN_KEY); hideBanner();
    });
    b.querySelector("[data-signup-open]").addEventListener("click", openModal);
    requestAnimationFrame(function () { b.classList.add("is-open"); });
    return b;
  }
  function hideBanner() {
    if (!bannerEl) return;
    bannerEl.classList.remove("is-open");
    window.setTimeout(function () {
      if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
      bannerEl = null;
    }, reduceMotion ? 0 : 350);
  }

  /* ---- Page detection ---- */
  function pageTag() {
    var p = location.pathname;
    if (/\/(booking)\.html$/.test(p)) return "booking";
    if (/\/(services)\.html$/.test(p)) return "treatments";
    if (p === "/" || /\/index\.html$/.test(p) || p === "") return "popup";
    return "site";
  }

  function init() {
    if (!document.body) return;
    // Manual triggers anywhere (e.g. a footer "Join our list" link).
    Array.prototype.forEach.call(document.querySelectorAll("[data-signup-open]"), function (el) {
      if (el.closest && el.closest(".signup-banner")) return; // banner handles its own
      el.addEventListener("click", function (e) { e.preventDefault(); openModal(); });
    });

    if (stored(DONE_KEY) || stored(SEEN_KEY)) return;

    var tag = pageTag();
    if (tag === "popup") {
      window.setTimeout(function () {
        if (!stored(DONE_KEY) && !stored(SEEN_KEY)) openModal();
      }, DELAY_MS);
    } else if (tag === "booking" || tag === "treatments") {
      // Show the slim banner a moment after arrival.
      window.setTimeout(function () {
        if (!stored(DONE_KEY) && !stored(SEEN_KEY)) bannerEl = buildBanner();
      }, 2500);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
