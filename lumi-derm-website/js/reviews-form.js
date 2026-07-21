/**
 * Lumi Derm — public "Leave a review" form
 * ------------------------------------------------------------------
 * Opens a modal with a star rating + short form, posts to /api/reviews.
 * Submissions are held pending until the team approves them in the admin,
 * so nothing appears on the site automatically.
 */
(function () {
  "use strict";

  var modal = document.querySelector("[data-review-form-modal]");
  var form = document.querySelector("[data-review-form]");
  if (!modal || !form) return;

  var openBtns = document.querySelectorAll("[data-review-form-open]");
  var closeEls = modal.querySelectorAll("[data-review-form-close]");
  var starWrap = modal.querySelector("[data-review-stars]");
  var stars = starWrap ? Array.prototype.slice.call(starWrap.querySelectorAll(".review-star")) : [];
  var statusEl = modal.querySelector("[data-review-form-status]");
  var rating = 0;
  var lastFocus = null;

  function paint(n) {
    stars.forEach(function (s, i) { s.classList.toggle("is-on", i < n); });
  }
  stars.forEach(function (s) {
    var val = parseInt(s.getAttribute("data-star"), 10);
    s.addEventListener("mouseenter", function () { paint(val); });
    s.addEventListener("focus", function () { paint(val); });
    s.addEventListener("click", function () { rating = val; paint(val); s.setAttribute("aria-checked", "true"); });
  });
  if (starWrap) starWrap.addEventListener("mouseleave", function () { paint(rating); });

  function open() {
    lastFocus = document.activeElement;
    modal.setAttribute("aria-hidden", "false");
    modal.classList.add("is-open");
    document.body.classList.add("reviews-modal-open");
    var first = form.querySelector('input[name="name"]');
    if (first) setTimeout(function () { try { first.focus(); } catch (e) {} }, 60);
  }
  function close() {
    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("is-open");
    document.body.classList.remove("reviews-modal-open");
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  Array.prototype.forEach.call(openBtns, function (b) { b.addEventListener("click", open); });
  Array.prototype.forEach.call(closeEls, function (b) { b.addEventListener("click", close); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("is-open")) close();
  });

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = "review-form-status" + (kind ? " is-" + kind : "");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = {
      name: form.name.value.trim(),
      rating: rating,
      treatment: form.treatment.value.trim(),
      text: form.text.value.trim(),
      email: form.email.value.trim(),
      company: form.company.value
    };
    if (!data.name) return setStatus("Please add your name.", "error");
    if (!data.rating) return setStatus("Please tap a star to rate us.", "error");
    if (data.text.length < 4) return setStatus("Please write a little about your visit.", "error");

    var btn = form.querySelector(".review-form-submit");
    if (btn) btn.disabled = true;
    setStatus("Sending…");
    fetch("/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data)
    }).then(function (res) {
      return res.json().then(function (p) { if (!res.ok) throw new Error(p.error || "Something went wrong."); return p; });
    }).then(function () {
      form.innerHTML =
        '<div class="review-form-done">' +
          '<div class="review-form-tick" aria-hidden="true">&#10003;</div>' +
          '<h3>Thank you!</h3>' +
          '<p>Your review has been sent to the team. Once it&rsquo;s approved it will appear on the site.</p>' +
          '<button class="btn btn-primary" type="button" data-review-form-close>Done</button>' +
        '</div>';
      form.querySelector("[data-review-form-close]").addEventListener("click", close);
    }).catch(function (err) {
      if (btn) btn.disabled = false;
      setStatus(err.message, "error");
    });
  });
})();
