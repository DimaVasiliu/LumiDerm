/**
 * Lumi Derm — admin email sender
 * ------------------------------------------------------------------
 * Composes a branded campaign from published offers and posts it to
 * the Worker at /api/campaign/send. Consent is enforced twice: once
 * when the Treatwell CSV is parsed (non-opted-in rows are discarded),
 * and again on the server against the unsubscribe suppression list.
 */
(function () {
  "use strict";

  var OFFERS_URL = "../assets/data/offers.json";
  var KEY_STORE = "lumi-derm-mail-key-v1";
  var DRAFT_STORE = "lumi-derm-mail-draft-v1";

  var BOOKING_URL = "https://lumidermaesthetics.com/pages/booking.html";
  var SITE_URL = "https://lumidermaesthetics.com";

  var state = {
    offers: [],
    selected: {},          // index -> true
    recipients: [],        // [{ email, name }]
    csvRows: [],
    csvHeaders: [],
    mail: {
      template: "offers",
      subject: "",
      preview: "",
      eyebrow: "",
      headline: "",
      body: "",
      ctaLabel: "Book your consultation",
      ctaUrl: BOOKING_URL
    }
  };

  var TEMPLATES = {
    offers: {
      subject: "New at Lumi Derm",
      preview: "A calm, consultation-led start to your skin plan.",
      eyebrow: "New offer",
      headline: "Something new for your skin",
      body:
        "Hi {{name}},\n\n" +
        "We've just added something we think you'll like. Every treatment starts with a proper consultation, so we build a plan around your skin and your goals — never a package you don't need.\n\n" +
        "Have a look below.",
      ctaLabel: "Book your consultation",
      ctaUrl: BOOKING_URL
    },
    winback: {
      subject: "It's been a while, {{name}}",
      preview: "Your skin plan is still here when you're ready.",
      eyebrow: "We miss you",
      headline: "It's been a while",
      body:
        "Hi {{name}},\n\n" +
        "It's been a few months since your last visit — no pressure at all, but if you'd like to pick your plan back up, we're here.\n\n" +
        "Skin changes with the seasons, so if things feel different to last time, that's completely normal. Come in and we'll reassess properly rather than carrying on from where we left off.",
      ctaLabel: "Book a consultation",
      ctaUrl: BOOKING_URL
    },
    seasonal: {
      subject: "A seasonal treat from Lumi Derm",
      preview: "Limited time, limited spaces.",
      eyebrow: "Seasonal",
      headline: "Booking up for the season",
      body:
        "Hi {{name}},\n\n" +
        "Our seasonal treatments are open for booking, and the popular slots go quickly.\n\n" +
        "Here's what's available right now.",
      ctaLabel: "See availability",
      ctaUrl: BOOKING_URL
    },
    blank: {
      subject: "",
      preview: "",
      eyebrow: "",
      headline: "",
      body: "Hi {{name}},\n\n",
      ctaLabel: "Book now",
      ctaUrl: BOOKING_URL
    }
  };

  /* --------------------------------------------------------------- */
  /* Small helpers                                                     */
  /* --------------------------------------------------------------- */

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function status(el, message, kind) {
    if (!el) return;
    el.textContent = message;
    el.className = "admin-status" + (kind ? " is-" + kind : "");
  }
  function getKey() {
    try {
      return localStorage.getItem(KEY_STORE) || "";
    } catch (err) {
      return "";
    }
  }

  /* --------------------------------------------------------------- */
  /* CSV                                                               */
  /* --------------------------------------------------------------- */

  // Handles quoted fields, escaped quotes and commas inside quotes.
  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var i = 0;
    text = String(text).replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    while (i < text.length) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        field += ch;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === ",") {
        row.push(field);
        field = "";
        i += 1;
        continue;
      }
      if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
    }
    row.push(field);
    rows.push(row);

    return rows.filter(function (r) {
      return r.some(function (cell) {
        return String(cell).trim() !== "";
      });
    });
  }

  function looksConsented(value) {
    var v = String(value == null ? "" : value).trim().toLowerCase();
    if (!v) return false;
    return (
      v === "yes" ||
      v === "y" ||
      v === "true" ||
      v === "1" ||
      v === "opted in" ||
      v === "opted-in" ||
      v === "opt-in" ||
      v === "subscribed" ||
      v === "consented" ||
      v === "x" ||
      v === "✓"
    );
  }

  function guessColumn(headers, candidates) {
    for (var c = 0; c < candidates.length; c += 1) {
      for (var h = 0; h < headers.length; h += 1) {
        if (String(headers[h]).trim().toLowerCase().indexOf(candidates[c]) !== -1) {
          return h;
        }
      }
    }
    return -1;
  }

  function fillSelect(select, headers, chosen) {
    if (!select) return;
    select.innerHTML =
      '<option value="-1">— none —</option>' +
      headers
        .map(function (h, idx) {
          return '<option value="' + idx + '">' + esc(h || "Column " + (idx + 1)) + "</option>";
        })
        .join("");
    select.value = String(chosen);
  }

  function handleCsv(file) {
    var out = $("[data-recipients-status]");
    var reader = new FileReader();

    reader.onerror = function () {
      status(out, "Could not read that file.", "error");
    };

    reader.onload = function () {
      var rows = parseCsv(reader.result);
      if (rows.length < 2) {
        status(out, "That CSV looks empty.", "error");
        return;
      }

      state.csvHeaders = rows[0].map(function (h) {
        return String(h).trim();
      });
      state.csvRows = rows.slice(1);

      var emailCol = guessColumn(state.csvHeaders, ["email", "e-mail"]);
      var nameCol = guessColumn(state.csvHeaders, ["first name", "firstname", "name"]);
      var optCol = guessColumn(state.csvHeaders, ["opt-in", "opt in", "optin", "marketing", "consent"]);

      fillSelect($('[data-map-field="email"]'), state.csvHeaders, emailCol);
      fillSelect($('[data-map-field="name"]'), state.csvHeaders, nameCol);
      fillSelect($('[data-map-field="optin"]'), state.csvHeaders, optCol);

      $("[data-column-map]").hidden = false;
      $("[data-column-map-2]").hidden = false;

      buildRecipients();
    };

    reader.readAsText(file);
  }

  function buildRecipients() {
    var out = $("[data-recipients-status]");
    var emailCol = parseInt(($('[data-map-field="email"]') || {}).value, 10);
    var nameCol = parseInt(($('[data-map-field="name"]') || {}).value, 10);
    var optCol = parseInt(($('[data-map-field="optin"]') || {}).value, 10);
    var strict = ($('[data-map-field="strict"]') || {}).value !== "no";

    if (isNaN(emailCol) || emailCol < 0) {
      status(out, "Pick which column holds the email address.", "error");
      state.recipients = [];
      updateSendButton();
      return;
    }

    var seen = {};
    var kept = [];
    var noConsent = 0;
    var noEmail = 0;

    state.csvRows.forEach(function (row) {
      var email = String(row[emailCol] || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        noEmail += 1;
        return;
      }
      if (strict) {
        // No opt-in column selected, or the cell is not a yes → drop the row.
        if (isNaN(optCol) || optCol < 0 || !looksConsented(row[optCol])) {
          noConsent += 1;
          return;
        }
      }
      if (seen[email]) return;
      seen[email] = true;
      kept.push({
        email: email,
        name: nameCol >= 0 ? String(row[nameCol] || "").trim() : ""
      });
    });

    state.recipients = kept;

    var parts = [];
    parts.push(kept.length + " recipient" + (kept.length === 1 ? "" : "s") + " ready");
    if (noConsent) parts.push(noConsent + " dropped (no marketing consent)");
    if (noEmail) parts.push(noEmail + " dropped (no valid email)");

    var kind = kept.length ? "ok" : "error";
    if (!kept.length && noConsent) {
      status(
        out,
        "Nobody in this file has opted in — so there is nobody you can legally email. " +
          "Start collecting consent in Treatwell at each appointment.",
        "error"
      );
    } else {
      status(out, parts.join(" · "), kind);
    }

    updateSendButton();
  }

  /* --------------------------------------------------------------- */
  /* Offers                                                            */
  /* --------------------------------------------------------------- */

  function loadOffers() {
    fetch(OFFERS_URL, { cache: "no-store" })
      .then(function (res) {
        return res.ok ? res.json() : { offers: [] };
      })
      .then(function (data) {
        var list = (data && data.offers) || [];
        state.offers = list.filter(function (o) {
          if (String(o.status || "live").toLowerCase() === "draft") return false;
          if (o.expires) {
            var end = new Date(o.expires + "T23:59:59");
            if (!isNaN(end.getTime()) && end.getTime() < Date.now()) return false;
          }
          return true;
        });
        renderOfferPicker();
      })
      .catch(function () {
        var box = $("[data-offer-picker]");
        if (box) box.innerHTML = '<p class="admin-help">Could not load your offers.</p>';
      });
  }

  function renderOfferPicker() {
    var box = $("[data-offer-picker]");
    if (!box) return;

    if (!state.offers.length) {
      box.innerHTML = '<p class="admin-help">No live offers published yet.</p>';
      return;
    }

    box.innerHTML = state.offers
      .map(function (offer, i) {
        return (
          '<label class="offer-pick">' +
          '<input type="checkbox" data-offer-pick="' +
          i +
          '"' +
          (state.selected[i] ? " checked" : "") +
          ">" +
          '<span class="offer-pick-body">' +
          "<strong>" +
          esc(offer.title) +
          "</strong>" +
          "<em>" +
          esc(offer.price || "") +
          (offer.category ? " · " + esc(offer.category) : "") +
          "</em>" +
          "</span>" +
          "</label>"
        );
      })
      .join("");

    $$("[data-offer-pick]", box).forEach(function (input) {
      input.addEventListener("change", function () {
        var idx = parseInt(input.getAttribute("data-offer-pick"), 10);
        if (input.checked) state.selected[idx] = true;
        else delete state.selected[idx];
        renderPreview();
      });
    });
  }

  function chosenOffers() {
    return Object.keys(state.selected)
      .map(function (k) {
        return state.offers[parseInt(k, 10)];
      })
      .filter(Boolean);
  }

  /* --------------------------------------------------------------- */
  /* Email HTML                                                        */
  /* --------------------------------------------------------------- */

  function absolute(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return SITE_URL + "/" + String(path).replace(/^\/+/, "");
  }

  function paragraphs(text) {
    return String(text || "")
      .split(/\n{2,}/)
      .map(function (block) {
        var safe = esc(block.trim()).replace(/\n/g, "<br>");
        if (!safe) return "";
        return (
          '<p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#4a443e;">' +
          safe +
          "</p>"
        );
      })
      .join("");
  }

  function offerCard(offer) {
    var img = absolute(offer.image);
    return (
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:#faf8f6;">' +
      "<tr>" +
      (img
        ? '<td width="150" style="padding:0;"><img src="' +
          esc(img) +
          '" alt="" width="150" style="display:block;width:150px;height:auto;border:0;"></td>'
        : "") +
      '<td style="padding:20px 22px;">' +
      (offer.badge
        ? '<p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#c9a227;">' +
          esc(offer.badge) +
          "</p>"
        : "") +
      '<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:18px;color:#1c1a18;">' +
      esc(offer.title) +
      "</p>" +
      '<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#7d746b;">' +
      esc(offer.description || "") +
      "</p>" +
      '<p style="margin:0;font-family:Georgia,serif;font-size:16px;color:#1c1a18;">' +
      esc(offer.price || "") +
      "</p>" +
      "</td></tr></table>"
    );
  }

  function buildHtml(forPreview) {
    var m = state.mail;
    var offers = chosenOffers();
    var unsub = forPreview ? "#" : "{{unsubscribe}}";
    var greeting = forPreview ? "Sarah" : "{{name}}";

    var bodyHtml = paragraphs(String(m.body || "").replace(/\{\{name\}\}/g, greeting));

    return (
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
      esc(m.subject || "Lumi Derm Aesthetics") +
      "</title></head>" +
      '<body style="margin:0;padding:0;background:#f4f1ee;">' +
      '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' +
      esc(m.preview || "") +
      "</div>" +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ee;">' +
      '<tr><td align="center" style="padding:32px 16px;">' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:4px;">' +
      // header
      '<tr><td align="center" style="padding:36px 32px 28px;border-bottom:1px solid #e8e2db;">' +
      '<p style="margin:0;font-family:Georgia,serif;font-size:22px;letter-spacing:.16em;text-transform:uppercase;color:#1c1a18;">Lumi&nbsp;Derm</p>' +
      '<p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#a2968a;">Aesthetics &middot; London Docklands</p>' +
      "</td></tr>" +
      // body
      '<tr><td style="padding:40px 40px 8px;">' +
      (m.eyebrow
        ? '<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#a2968a;">' +
          esc(m.eyebrow) +
          "</p>"
        : "") +
      (m.headline
        ? '<h1 style="margin:0 0 20px;font-family:Georgia,serif;font-weight:400;font-size:30px;line-height:1.25;color:#1c1a18;">' +
          esc(m.headline) +
          "</h1>"
        : "") +
      bodyHtml +
      (offers.length
        ? '<div style="margin:28px 0 10px;">' + offers.map(offerCard).join("") + "</div>"
        : "") +
      // cta
      (m.ctaLabel && m.ctaUrl
        ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">' +
          '<tr><td align="center" bgcolor="#1c1a18" style="border-radius:2px;">' +
          '<a href="' +
          esc(m.ctaUrl) +
          '" style="display:inline-block;padding:16px 38px;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#ffffff;text-decoration:none;">' +
          esc(m.ctaLabel) +
          "</a></td></tr></table>"
        : "") +
      '<p style="margin:34px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#4a443e;">See you soon,<br>' +
      '<span style="font-family:Georgia,serif;font-size:17px;color:#1c1a18;">Iulia</span></p>' +
      "</td></tr>" +
      // footer
      '<tr><td style="padding:36px 40px 34px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
      '<tr><td style="border-top:1px solid #e8e2db;padding-top:26px;">' +
      '<p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#7d746b;"><strong style="color:#4a443e;">Lumi Derm Aesthetics</strong><br>London Docklands</p>' +
      '<p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;">' +
      '<a href="' +
      SITE_URL +
      '" style="color:#7d746b;">Website</a> &middot; ' +
      '<a href="' +
      BOOKING_URL +
      '" style="color:#7d746b;">Book</a></p>' +
      '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#a2968a;">' +
      "You're receiving this because you're a client of Lumi Derm Aesthetics and opted in to marketing.<br>" +
      '<a href="' +
      unsub +
      '" style="color:#a2968a;text-decoration:underline;">Unsubscribe</a></p>' +
      "</td></tr></table></td></tr>" +
      "</table></td></tr></table></body></html>"
    );
  }

  function renderPreview() {
    var frame = $("[data-mail-preview]");
    if (frame) frame.srcdoc = buildHtml(true);
    saveDraft();
    updateSendButton();
  }

  /* --------------------------------------------------------------- */
  /* Sending                                                           */
  /* --------------------------------------------------------------- */

  function updateSendButton() {
    var btn = $("[data-send-campaign]");
    if (!btn) return;
    var confirmed = ($("[data-consent-confirm]") || {}).checked === true;
    var ready =
      confirmed && state.recipients.length > 0 && String(state.mail.subject || "").trim() !== "";
    btn.disabled = !ready;
  }

  function postCampaign(recipients, isTest) {
    var key = getKey();
    if (!key) {
      return Promise.reject(new Error("No send key. Add it in Settings → Sending connection."));
    }
    return fetch("/api/campaign/send", {
      method: "POST",
      headers: { "content-type": "application/json", "x-lumi-key": key },
      body: JSON.stringify({
        subject: String(state.mail.subject || "").replace(/\{\{name\}\}/g, "there"),
        html: buildHtml(false),
        recipients: recipients,
        test: isTest === true
      })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "Send failed (" + res.status + ").");
        return data;
      });
    });
  }

  function bindSending() {
    var out = $("[data-send-status]");

    var testBtn = $("[data-send-test]");
    if (testBtn) {
      testBtn.addEventListener("click", function () {
        var email = String(($("[data-test-email]") || {}).value || "").trim();
        if (!email) {
          status(out, "Enter an address to send the test to.", "error");
          return;
        }
        if (!String(state.mail.subject || "").trim()) {
          status(out, "Add a subject line first.", "error");
          return;
        }
        testBtn.disabled = true;
        status(out, "Sending test…");
        postCampaign([{ email: email, name: "Test" }], true)
          .then(function () {
            status(out, "Test sent to " + email + ". Check it on your phone.", "ok");
          })
          .catch(function (err) {
            status(out, err.message, "error");
          })
          .then(function () {
            testBtn.disabled = false;
          });
      });
    }

    var confirmBox = $("[data-consent-confirm]");
    if (confirmBox) confirmBox.addEventListener("change", updateSendButton);

    var sendBtn = $("[data-send-campaign]");
    if (sendBtn) {
      sendBtn.addEventListener("click", function () {
        var count = state.recipients.length;
        var ok = window.confirm(
          "Send this email to " +
            count +
            " client" +
            (count === 1 ? "" : "s") +
            " now?\n\nThis cannot be undone."
        );
        if (!ok) return;

        sendBtn.disabled = true;
        status(out, "Sending to " + count + " clients…");

        postCampaign(state.recipients, false)
          .then(function (data) {
            var msg = "Sent to " + data.sent + " client" + (data.sent === 1 ? "" : "s") + ".";
            if (data.suppressed) msg += " " + data.suppressed + " skipped (unsubscribed).";
            if (data.errors && data.errors.length) {
              status(out, msg + " Some batches failed: " + data.errors.join(" | "), "error");
            } else {
              status(out, msg, "ok");
            }
          })
          .catch(function (err) {
            status(out, err.message, "error");
          })
          .then(function () {
            updateSendButton();
          });
      });
    }
  }

  /* --------------------------------------------------------------- */
  /* Settings (send key)                                               */
  /* --------------------------------------------------------------- */

  function bindSettings() {
    var field = $("[data-mail-field-key]");
    var out = $("[data-mail-health-status]");
    if (field) field.value = getKey();

    var saveBtn = $("[data-mail-key-save]");
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        try {
          localStorage.setItem(KEY_STORE, String((field && field.value) || "").trim());
          status(out, "Key saved in this browser.", "ok");
        } catch (err) {
          status(out, "Could not save the key.", "error");
        }
      });
    }

    var testBtn = $("[data-mail-health]");
    if (testBtn) {
      testBtn.addEventListener("click", function () {
        status(out, "Checking…");
        fetch("/api/health", { cache: "no-store" })
          .then(function (res) {
            return res.json();
          })
          .then(function (data) {
            var missing = [];
            if (!data.resend) missing.push("RESEND_API_KEY");
            if (!data.sendKey) missing.push("SEND_KEY");
            if (!data.unsubSecret) missing.push("UNSUB_SECRET");
            if (!data.suppression) missing.push("SUPPRESSION KV");
            if (missing.length) {
              status(out, "Server is missing: " + missing.join(", ") + ".", "error");
            } else {
              status(out, "Ready. Sending from " + (data.from || "the configured address") + ".", "ok");
            }
          })
          .catch(function () {
            status(out, "No API found. Has the Worker been deployed?", "error");
          });
      });
    }
  }

  /* --------------------------------------------------------------- */
  /* Compose bindings + draft                                          */
  /* --------------------------------------------------------------- */

  function applyTemplate(name) {
    var t = TEMPLATES[name] || TEMPLATES.blank;
    state.mail.template = name;
    state.mail.subject = t.subject;
    state.mail.preview = t.preview;
    state.mail.eyebrow = t.eyebrow;
    state.mail.headline = t.headline;
    state.mail.body = t.body;
    state.mail.ctaLabel = t.ctaLabel;
    state.mail.ctaUrl = t.ctaUrl;
    syncFields();
    renderPreview();
  }

  function syncFields() {
    $$("[data-mail-field]").forEach(function (field) {
      var key = field.getAttribute("data-mail-field");
      if (key in state.mail) field.value = state.mail[key] || "";
    });
  }

  function saveDraft() {
    try {
      localStorage.setItem(
        DRAFT_STORE,
        JSON.stringify({ mail: state.mail, selected: state.selected })
      );
    } catch (err) {
      /* full or blocked storage — the draft is a convenience, not critical */
    }
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_STORE);
      if (!raw) return false;
      var saved = JSON.parse(raw);
      if (saved && saved.mail) {
        Object.keys(saved.mail).forEach(function (k) {
          state.mail[k] = saved.mail[k];
        });
        state.selected = saved.selected || {};
        return true;
      }
    } catch (err) {
      /* ignore a corrupt draft */
    }
    return false;
  }

  function bindCompose() {
    $$("[data-mail-field]").forEach(function (field) {
      var key = field.getAttribute("data-mail-field");
      field.addEventListener("input", function () {
        if (key === "template") return;
        state.mail[key] = field.value;
        renderPreview();
      });
      if (key === "template") {
        field.addEventListener("change", function () {
          applyTemplate(field.value);
        });
      }
    });

    var file = $("[data-recipients-file]");
    if (file) {
      file.addEventListener("change", function () {
        if (file.files && file.files[0]) handleCsv(file.files[0]);
      });
    }

    $$("[data-map-field]").forEach(function (select) {
      select.addEventListener("change", buildRecipients);
    });
  }

  /* --------------------------------------------------------------- */
  /* Init                                                              */
  /* --------------------------------------------------------------- */

  function init() {
    if (!document.getElementById("sender")) return;
    bindCompose();
    bindSending();
    bindSettings();
    loadOffers();
    if (!loadDraft()) {
      applyTemplate("offers");
    } else {
      syncFields();
      renderPreview();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
