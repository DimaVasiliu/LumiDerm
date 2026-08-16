/**
 * Lumi Derm — homepage "Ask us a question" form
 * ------------------------------------------------------------------
 * Sits in the FAQ band. Posts to /api/ask, which emails the clinic inbox
 * with the visitor's address as reply-to. Nothing is published to the site.
 */
(function () {
  "use strict";

  var form = document.querySelector("[data-ask-form]");
  if (!form) return;
  var statusEl = form.querySelector("[data-ask-status]");

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.className = "faq-ask-status" + (kind ? " is-" + kind : "");
  }

  function field(name) {
    var el = form.elements[name];
    return el ? String(el.value || "").trim() : "";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = {
      name: field("name"),
      email: field("email"),
      phone: field("phone"),
      treatment: field("treatment"),
      question: field("question"),
      company: form.elements.company ? form.elements.company.value : ""
    };

    if (!data.name) return setStatus("Please add your name.", "error");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) return setStatus("Please add a valid email so we can reply.", "error");
    if (data.question.length < 5) return setStatus("Please type your question.", "error");

    var btn = form.querySelector(".faq-ask-submit");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    setStatus("Sending…");

    fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data)
    }).then(function (res) {
      return res.json().then(function (p) { if (!res.ok) throw new Error(p.error || "Something went wrong."); return p; });
    }).then(function (p) {
      var card = form.closest(".faq-ask-card") || form.parentNode;
      card.innerHTML =
        '<div class="faq-ask-done">' +
          '<div class="faq-ask-tick" aria-hidden="true">&#10003;</div>' +
          '<h3 class="faq-ask-title">Question sent</h3>' +
          '<p>' + (p && p.message ? p.message : "Thanks! We'll reply by email soon.") + '</p>' +
          '<p class="faq-ask-privacy">In a hurry? Call or WhatsApp <a href="tel:07832839298">07832&nbsp;839298</a>.</p>' +
        '</div>';
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = "Send question"; }
      setStatus(err && err.message ? err.message : "Sorry, something went wrong. Please try again.", "error");
    });
  });
})();
