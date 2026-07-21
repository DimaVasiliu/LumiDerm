/**
 * Lumi Derm — admin email sender
 * ------------------------------------------------------------------
 * Composes a branded campaign from published offers and posts it to
 * the Access-protected Worker admin API. Consent is enforced twice: once
 * when the Treatwell CSV is parsed (non-opted-in rows are discarded),
 * and again on the server against the unsubscribe suppression list.
 */
(function () {
  "use strict";

  var ADMIN_API = "/admin/api";
  var OFFERS_URL = "../assets/data/offers.json";
  var DRAFT_STORE = "lumi-derm-mail-draft-v1";

  var BOOKING_URL = "https://lumidermaesthetics.com/pages/booking.html";
  var SITE_URL = "https://lumidermaesthetics.com";

  var state = {
    offers: [],
    selected: {},          // index -> true
    recipients: [],        // [{ email, name }]
    allSubs: [],           // full confirmed subscriber rows (for segmenting)
    csvRows: [],
    csvHeaders: [],
    audienceSource: "website",
    mail: {
      template: "offers",
      subject: "",
      preview: "",
      eyebrow: "",
      headline: "",
      body: "",
      ctaLabel: "Book your consultation",
      ctaUrl: BOOKING_URL,
      ctaAuto: true,         // true = button link follows the ticked offer; false = Iulia set it herself
      heroImage: ""          // optional banner image URL (/media/... in R2)
    }
  };
  var campaignDrafts = [];
  var currentCampaignId = "";

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
  // Friendly message for a low-level failure (expired Access session, etc.).
  function friendly(err) {
    return window.ldFriendlyError ? window.ldFriendlyError(err) : ((err && err.message) || String(err));
  }
  // Styled confirm modal (falls back to native confirm if the helper isn't loaded).
  function confirmModal(opts) {
    if (window.ldConfirm) return window.ldConfirm(opts);
    return Promise.resolve(window.confirm((opts && opts.body) || "Are you sure?"));
  }
  function responseJson(res) {
    return res.text().then(function (text) {
      var data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (err) {
        throw new Error(friendly(new Error("webpage instead of data")));
      }
      if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ").");
      return data;
    });
  }
  function setHidden(sel, hidden) {
    var el = $(sel);
    if (el) el.hidden = hidden;
  }
  function apiJson(path, options) {
    var next = options || {};
    next.credentials = "same-origin";
    next.headers = Object.assign({}, next.headers || {});
    return fetch(path, next).then(function (res) {
      return responseJson(res);
    });
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
      var lastVisitCol = guessColumn(state.csvHeaders, ["last visit", "last appointment", "last booking", "last seen", "last treatment"]);

      fillSelect($('[data-map-field="email"]'), state.csvHeaders, emailCol);
      fillSelect($('[data-map-field="name"]'), state.csvHeaders, nameCol);
      fillSelect($('[data-map-field="optin"]'), state.csvHeaders, optCol);
      fillSelect($('[data-map-field="lastvisit"]'), state.csvHeaders, lastVisitCol);

      $("[data-column-map]").hidden = false;
      $("[data-column-map-2]").hidden = false;
      setHidden("[data-column-map-3]", false);

      buildRecipients();
      renderCsvPreview();
    };

    reader.readAsText(file);
  }

  function buildRecipients() {
    var out = $("[data-recipients-status]");
    var emailCol = parseInt(($('[data-map-field="email"]') || {}).value, 10);
    var nameCol = parseInt(($('[data-map-field="name"]') || {}).value, 10);
    var optCol = parseInt(($('[data-map-field="optin"]') || {}).value, 10);
    var strict = ($('[data-map-field="strict"]') || {}).value !== "no";
    var lastVisitCol = parseInt(($('[data-map-field="lastvisit"]') || {}).value, 10);
    var inactiveDays = parseInt(($('[data-map-field="inactiveDays"]') || {}).value, 10);
    var inactiveCutoff = !isNaN(inactiveDays) && inactiveDays > 0
      ? Date.now() - inactiveDays * 24 * 60 * 60 * 1000
      : null;

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
    var notInactive = 0;

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
      if (inactiveCutoff && lastVisitCol >= 0) {
        var last = parseDate(row[lastVisitCol]);
        if (!last || last.getTime() > inactiveCutoff) {
          notInactive += 1;
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
    if (notInactive) parts.push(notInactive + " dropped (not inactive long enough)");

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

  function parseDate(value) {
    var raw = String(value || "").trim();
    if (!raw) return null;
    var direct = new Date(raw);
    if (!isNaN(direct.getTime())) return direct;
    var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(raw);
    if (m) {
      var y = parseInt(m[3], 10);
      if (y < 100) y += 2000;
      var d = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  function renderCsvPreview() {
    var box = $("[data-csv-preview]");
    if (!box) return;
    if (!state.csvHeaders.length || !state.csvRows.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }

    var emailCol = parseInt(($('[data-map-field="email"]') || {}).value, 10);
    var nameCol = parseInt(($('[data-map-field="name"]') || {}).value, 10);
    var optCol = parseInt(($('[data-map-field="optin"]') || {}).value, 10);
    var strict = ($('[data-map-field="strict"]') || {}).value !== "no";

    var rows = state.csvRows.slice(0, 5).map(function (row) {
      var opted = !strict ? "Allowed manually" : optCol >= 0 && looksConsented(row[optCol]) ? "Yes" : "No";
      return (
        "<tr>" +
        "<td>" + esc(emailCol >= 0 ? row[emailCol] || "" : "") + "</td>" +
        "<td>" + esc(nameCol >= 0 ? row[nameCol] || "" : "") + "</td>" +
        "<td>" + esc(opted) + "</td>" +
        "</tr>"
      );
    }).join("");

    box.hidden = false;
    box.innerHTML =
      '<p class="admin-eyebrow">CSV preview</p>' +
      '<div class="admin-table-wrap"><table class="admin-table csv-preview-table">' +
      "<thead><tr><th>Email</th><th>Name</th><th>Marketing opt-in</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>" +
      '<p class="admin-help">Showing the first 5 rows with the selected column mapping.</p>';
  }

  function loadWebsiteSubscribers() {
    var out = $("[data-recipients-status]");
    state.recipients = [];
    updateSendButton();
    status(out, "Loading confirmed website subscribers…");
    fetch(ADMIN_API + "/subscribers", { cache: "no-store", credentials: "same-origin" })
      .then(function (res) {
        return responseJson(res);
      })
      .then(function (data) {
        // Keep the full confirmed+consented list; segments filter it live.
        state.allSubs = (data.subscribers || []).filter(function (row) {
          return row.status === "confirmed" && Number(row.consent_email) === 1;
        });
        applySegment();
      })
      .catch(function (err) {
        state.allSubs = [];
        status(out, friendly(err), "error");
        updateSendButton();
      });
  }

  // Filter the loaded subscribers by the chosen segment (interest / birthday month)
  // and update the live recipient count.
  function applySegment() {
    if (state.audienceSource !== "website") return;
    var interestSel = $('[data-segment="interest"]');
    var monthSel = $('[data-segment="month"]');
    var sinceSel = $('[data-segment="confirmed_since"]');
    var interest = interestSel ? interestSel.value : "";
    var month = monthSel ? parseInt(monthSel.value, 10) : NaN;
    var since = sinceSel && sinceSel.value ? new Date(sinceSel.value + "T00:00:00") : null;

    var filtered = (state.allSubs || []).filter(function (row) {
      if (interest && String(row.interest || "") !== interest) return false;
      if (!isNaN(month) && Number(row.birth_month) !== month) return false;
      if (since) {
        var confirmed = new Date(row.confirmed_at || row.created_at || "");
        if (isNaN(confirmed.getTime()) || confirmed < since) return false;
      }
      return true;
    });

    state.recipients = filtered.map(function (row) {
      return {
        email: row.email,
        name: [row.first_name, row.last_name].filter(Boolean).join(" ")
      };
    });

    var total = (state.allSubs || []).length;
    var count = $("[data-segment-count]");
    if (count) {
      var segmenting = interest || !isNaN(month) || Boolean(since);
      count.hidden = false;
      count.innerHTML =
        "<strong>" + state.recipients.length + "</strong> " +
        (state.recipients.length === 1 ? "person" : "people") +
        (segmenting ? " match this segment" : " on your list") +
        (segmenting ? ' <span class="segment-of">(of ' + total + " total)</span>" : "");
    }
    status(
      $("[data-recipients-status]"),
      state.recipients.length + " recipient" + (state.recipients.length === 1 ? "" : "s") + " ready to send to.",
      state.recipients.length ? "ok" : "error"
    );
    updateSendButton();
  }

  function setAudienceSource(source) {
    state.audienceSource = source === "csv" ? "csv" : "website";
    var isWebsite = state.audienceSource === "website";
    setHidden("[data-csv-recipient-controls]", isWebsite);
    setHidden("[data-segment-controls]", !isWebsite);
    setHidden("[data-column-map]", true);
    setHidden("[data-column-map-2]", true);
    setHidden("[data-column-map-3]", true);
    setHidden("[data-csv-preview]", true);
    setHidden("[data-segment-count]", true);
    state.recipients = [];
    if (isWebsite) {
      loadWebsiteSubscribers();
    } else {
      status($("[data-recipients-status]"), "Choose a Treatwell CSV export to build the recipient list.");
      updateSendButton();
    }
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
        applyAutoCta();
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
        applyAutoCta();
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

  /* ---- Auto button link from the ticked offers -------------------- */
  function offerBookingUrl(offer) {
    return BOOKING_URL + (offer && offer.service ? "?service=" + encodeURIComponent(offer.service) : "");
  }

  // The link the main button should use, based on the ticked offers:
  //   exactly one offer -> that treatment's booking deep-link
  //   zero / several     -> the general booking page
  function autoCtaUrl() {
    var chosen = chosenOffers();
    if (chosen.length === 1) return offerBookingUrl(chosen[0]);
    return BOOKING_URL;
  }

  // A friendly description of where a link points, for the hint.
  function ctaLinkLabel(url) {
    if (!url) return "no link set";
    var m = /[?&]service=([^&]+)/.exec(url);
    if (m) return "the " + decodeURIComponent(m[1]).replace(/-/g, " ") + " booking page";
    if (/\/booking\.html/i.test(url)) return "the general booking page";
    return url;
  }

  // Recompute the button link from the selection — unless Iulia typed her own.
  function applyAutoCta() {
    if (state.mail.ctaAuto !== false) {
      state.mail.ctaUrl = autoCtaUrl();
      var field = $('[data-mail-field="ctaUrl"]');
      if (field) field.value = state.mail.ctaUrl;
    }
    updateCtaHint();
  }

  function updateCtaHint() {
    var hint = $("[data-cta-hint]");
    if (!hint) return;
    var chosen = chosenOffers();
    if (state.mail.ctaAuto === false) {
      hint.innerHTML = "Custom link &mdash; the button opens " + esc(ctaLinkLabel(state.mail.ctaUrl)) +
        '. <button type="button" class="link-button" data-cta-auto>Use the selected offer&rsquo;s link</button>';
    } else if (chosen.length === 1) {
      hint.innerHTML = "Auto &mdash; the button opens " + esc(ctaLinkLabel(state.mail.ctaUrl)) + ". Edit the link above to override.";
    } else if (chosen.length > 1) {
      hint.innerHTML = "Auto &mdash; several offers ticked, so the button opens the general booking page. Tick just one to deep-link to it.";
    } else {
      hint.innerHTML = "Auto &mdash; the button opens the general booking page. Tick one offer to point it straight at that treatment.";
    }
    var resetBtn = hint.querySelector("[data-cta-auto]");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        state.mail.ctaAuto = true;
        applyAutoCta();
        renderPreview();
      });
    }
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
    var href =
      BOOKING_URL + (offer.service ? "?service=" + encodeURIComponent(offer.service) : "");
    return (
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;background:#ffffff;border:1px solid #ece7e1;border-radius:8px;">' +
      "<tr>" +
      (img
        ? '<td width="150" valign="top" style="padding:0;"><img src="' +
          esc(img) +
          '" alt="' + esc(offer.alt || offer.title || "") + '" width="150" style="display:block;width:150px;height:auto;border:0;border-radius:8px 0 0 8px;"></td>'
        : "") +
      '<td valign="top" style="padding:20px 22px;">' +
      (offer.badge
        ? '<span style="display:inline-block;margin:0 0 10px;padding:3px 9px;font-family:Arial,Helvetica,sans-serif;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#ffffff;background:#c9a227;border-radius:3px;">' +
          esc(offer.badge) +
          "</span>"
        : "") +
      '<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:18px;line-height:1.3;color:#1c1a18;">' +
      esc(offer.title) +
      "</p>" +
      '<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#7d746b;">' +
      esc(offer.description || "") +
      "</p>" +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td style="font-family:Georgia,serif;font-size:17px;color:#1c1a18;">' +
      esc(offer.price || "") +
      "</td>" +
      '<td align="right"><a href="' +
      esc(href) +
      '" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#c9a227;text-decoration:none;">Book &rarr;</a></td>' +
      "</tr></table>" +
      "</td></tr></table>"
    );
  }

  // Build the branded email from any mail-like object (used by campaigns AND the
  // birthday automation), so nobody has to touch raw HTML.
  function renderEmail(m, forPreview, offers) {
    offers = offers || [];
    var unsub = forPreview ? "#" : "{{unsubscribe}}";
    var pref = forPreview ? "#" : "{{preferences}}";
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
      // optional banner image
      (m.heroImage
        ? '<tr><td style="padding:0;font-size:0;line-height:0;"><img src="' + esc(absolute(m.heroImage)) +
          '" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:4px 4px 0 0;"></td></tr>'
        : "") +
      // gold top accent
      '<tr><td style="padding:0;height:3px;line-height:3px;font-size:0;background:#c9a227;">&nbsp;</td></tr>' +
      // header
      '<tr><td align="center" style="padding:38px 32px 4px;">' +
      '<p style="margin:0;font-family:Georgia,serif;font-size:24px;letter-spacing:.18em;text-transform:uppercase;color:#1c1a18;">Lumi&nbsp;Derm</p>' +
      '<p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#a2968a;">Aesthetics &middot; London Docklands</p>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:20px auto 0;"><tr><td style="width:44px;height:2px;line-height:2px;font-size:0;background:#c9a227;">&nbsp;</td></tr></table>' +
      "</td></tr>" +
      // body
      '<tr><td style="padding:30px 40px 8px;">' +
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
        ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 18px;"><tr>' +
          '<td style="border-top:1px solid #ece7e1;font-size:0;line-height:0;">&nbsp;</td>' +
          '<td style="padding:0 14px;white-space:nowrap;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#a2968a;">Featured for you</td>' +
          '<td style="border-top:1px solid #ece7e1;font-size:0;line-height:0;">&nbsp;</td>' +
          "</tr></table>" +
          offers.map(offerCard).join("")
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
      '<tr><td style="padding:24px 40px 38px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
      '<tr><td align="center" style="border-top:1px solid #e8e2db;padding-top:30px;">' +
      '<p style="margin:0 0 4px;font-family:Georgia,serif;font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:#1c1a18;">Lumi&nbsp;Derm</p>' +
      '<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#a2968a;">London Docklands</p>' +
      '<p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.06em;">' +
      '<a href="' +
      SITE_URL +
      '" style="color:#7d746b;text-decoration:none;">Website</a>' +
      '<span style="color:#d8cfc5;">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>' +
      '<a href="' +
      BOOKING_URL +
      '" style="color:#7d746b;text-decoration:none;">Book</a>' +
      '<span style="color:#d8cfc5;">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>' +
      '<a href="https://www.instagram.com/lumi.derm.aesthetic/" style="color:#7d746b;text-decoration:none;">Instagram</a>' +
      "</p>" +
      '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#b8ada1;">' +
      "You're receiving this because you opted in to hear from Lumi Derm Aesthetics.<br>" +
      '<a href="' +
      pref +
      '" style="color:#b8ada1;text-decoration:underline;">Preferences</a>' +
      '<span style="color:#d8cfc5;">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>' +
      '<a href="' +
      unsub +
      '" style="color:#b8ada1;text-decoration:underline;">Unsubscribe</a></p>' +
      "</td></tr></table></td></tr>" +
      "</table></td></tr></table></body></html>"
    );
  }

  // Campaign email = the composer's mail + its ticked offers.
  function buildHtml(forPreview) {
    return renderEmail(state.mail, forPreview, chosenOffers());
  }

  function renderPreview() {
    var frame = $("[data-mail-preview]");
    if (frame) frame.srcdoc = buildHtml(true);
    updateBannerUI();
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
    var scheduling = ($("[data-schedule-toggle]") || {}).checked === true;
    var ready =
      confirmed && state.recipients.length > 0 && String(state.mail.subject || "").trim() !== "";
    btn.disabled = !ready;
    btn.textContent = scheduling ? "Schedule campaign" : "Send campaign";
    renderSafetyChecks();
  }

  function safetyChecks() {
    var checks = [];
    var subject = String(state.mail.subject || "").trim();
    var ctaUrl = String(state.mail.ctaUrl || "").trim();
    var html = buildHtml(false);
    checks.push({
      ok: Boolean(subject),
      text: subject ? "Subject line is set." : "Add a subject line before sending."
    });
    checks.push({
      ok: state.recipients.length > 0,
      text: state.recipients.length ? state.recipients.length + " recipient" + (state.recipients.length === 1 ? "" : "s") + " loaded." : "Load an audience before sending."
    });
    checks.push({
      ok: /\{\{unsubscribe\}\}/.test(html),
      text: "Unsubscribe token is included."
    });
    checks.push({
      ok: /\{\{preferences\}\}/.test(html),
      text: "Preference-centre token is included."
    });
    checks.push({
      ok: !ctaUrl || /^https:\/\/(lumidermaesthetics\.com|www\.treatwell\.co\.uk)\//i.test(ctaUrl),
      text: ctaUrl ? "Button link points to an approved Lumi/Treatwell URL." : "No button link set."
    });
    checks.push({
      ok: state.audienceSource === "website" || ($('[data-map-field="strict"]') || {}).value !== "no",
      text: state.audienceSource === "website" ? "Audience uses confirmed website consent." : "Treatwell CSV is restricted to opted-in rows."
    });
    return checks;
  }

  function renderSafetyChecks() {
    var list = $("[data-send-safety]");
    if (!list) return;
    list.innerHTML = safetyChecks().map(function (check) {
      return '<li class="' + (check.ok ? "is-ok" : "is-warn") + '">' + esc(check.text) + "</li>";
    }).join("");
  }

  function postCampaign(recipients, isTest) {
    return fetch(ADMIN_API + "/campaign/send", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: String(state.mail.subject || ""),
        html: buildHtml(false),
        recipients: recipients,
        audienceSource: isTest === true ? "test" : state.audienceSource,
        test: isTest === true
      })
    }).then(function (res) { return responseJson(res); });
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
            status(out, friendly(err), "error");
          })
          .then(function () {
            testBtn.disabled = false;
          });
      });
    }

    var confirmBox = $("[data-consent-confirm]");
    if (confirmBox) confirmBox.addEventListener("change", updateSendButton);

    var scheduleToggle = $("[data-schedule-toggle]");
    var scheduleWhen = $("[data-schedule-when]");
    if (scheduleToggle) {
      scheduleToggle.addEventListener("change", function () {
        if (scheduleWhen) scheduleWhen.hidden = !scheduleToggle.checked;
        updateSendButton();
      });
    }
    var schedReload = $("[data-scheduled-reload]");
    if (schedReload) schedReload.addEventListener("click", loadScheduled);

    var sendBtn = $("[data-send-campaign]");
    if (sendBtn) {
      sendBtn.addEventListener("click", function () {
        var count = state.recipients.length;
        if (scheduleToggle && scheduleToggle.checked) { scheduleCampaign(count); return; }
        confirmModal({
          title: "Send this campaign now?",
          body: "This emails " + count + " subscriber" + (count === 1 ? "" : "s") + " straight away. This cannot be undone.",
          confirmLabel: "Send now",
          danger: true
        }).then(function (ok) {
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
              loadHistory();
            })
            .catch(function (err) { status(out, friendly(err), "error"); })
            .then(function () { updateSendButton(); });
        });
      });
    }
  }

  /* --------------------------------------------------------------- */
  /* Banner image (optional, stored in R2)                             */
  /* --------------------------------------------------------------- */

  function updateBannerUI() {
    var img = $("[data-mail-banner-preview]");
    var clear = $("[data-mail-banner-clear]");
    var url = state.mail.heroImage || "";
    if (img) {
      if (url) { img.src = url; img.hidden = false; } else { img.hidden = true; img.removeAttribute("src"); }
    }
    if (clear) clear.hidden = !url;
  }

  function bindBanner() {
    var uploadBtn = $("[data-mail-banner-upload]");
    var fileInput = $("[data-mail-banner-file]");
    var clearBtn = $("[data-mail-banner-clear]");
    var statusEl = $("[data-mail-banner-status]");
    if (uploadBtn && fileInput) uploadBtn.addEventListener("click", function () { fileInput.click(); });
    if (fileInput) fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type || "")) { status(statusEl, "That file is not an image.", "error"); fileInput.value = ""; return; }
      if (file.size > 12 * 1024 * 1024) { status(statusEl, "That image is larger than 12MB.", "error"); fileInput.value = ""; return; }
      status(statusEl, "Preparing…");
      Promise.resolve(window.ldPrepareImageUpload ? window.ldPrepareImageUpload(file, { width: 1200, height: 620, quality: 0.86, prefix: "email-banner" }) : file)
        .then(function (prepared) {
          status(statusEl, "Uploading…");
          var form = new FormData();
          form.append("file", prepared, prepared.name || file.name);
          return fetch(ADMIN_API + "/media/upload", { method: "POST", credentials: "same-origin", body: form });
        })
        .then(function (res) { return responseJson(res); })
        .then(function (d) {
          state.mail.heroImage = d.url || "";
          status(statusEl, "Banner added.", "ok");
          updateBannerUI();
          renderPreview();
        })
        .catch(function (err) { status(statusEl, "Upload failed: " + friendly(err), "error"); })
        .then(function () { fileInput.value = ""; });
    });
    if (clearBtn) clearBtn.addEventListener("click", function () {
      state.mail.heroImage = "";
      updateBannerUI();
      renderPreview();
      status(statusEl, "", "");
    });
  }

  /* --------------------------------------------------------------- */
  /* Scheduling                                                        */
  /* --------------------------------------------------------------- */

  function scheduleCampaign(count) {
    var out = $("[data-send-status]");
    var atEl = $("[data-schedule-at]");
    var val = atEl ? atEl.value : "";
    if (!val) { status(out, "Pick a date and time to schedule.", "error"); return; }
    var when = new Date(val); // datetime-local is the browser's local time
    if (isNaN(when.getTime())) { status(out, "That date and time isn't valid.", "error"); return; }
    if (when.getTime() < Date.now()) { status(out, "Pick a future date and time.", "error"); return; }
    var human = when.toLocaleString();
    confirmModal({
      title: "Schedule this campaign?",
      body: "This will email " + count + " subscriber" + (count === 1 ? "" : "s") + " automatically on " + human + ".",
      confirmLabel: "Schedule"
    }).then(function (ok) {
      if (!ok) return;
      var btn = $("[data-send-campaign]");
      if (btn) btn.disabled = true;
      status(out, "Scheduling…");
      fetch(ADMIN_API + "/campaign/schedule", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: String(state.mail.subject || ""),
          html: buildHtml(false),
          recipients: state.recipients,
          audienceSource: state.audienceSource,
          sendAt: when.toISOString()
        })
      })
        .then(function (res) { return responseJson(res); })
        .then(function (d) {
          status(out, "Scheduled for " + human + " — " + d.recipients + " recipient" + (d.recipients === 1 ? "" : "s") + ".", "ok");
          loadScheduled();
        })
        .catch(function (err) { status(out, friendly(err), "error"); })
        .then(function () { updateSendButton(); });
    });
  }

  function loadScheduled() {
    var box = $("[data-scheduled-list]");
    if (!box) return;
    fetch(ADMIN_API + "/campaign/scheduled", { cache: "no-store", credentials: "same-origin" })
      .then(function (res) { return responseJson(res); })
      .then(function (d) { renderScheduled(d.scheduled || []); })
      .catch(function (err) { box.innerHTML = '<p class="admin-status is-error">' + esc(friendly(err)) + "</p>"; });
  }

  function renderScheduled(list) {
    var box = $("[data-scheduled-list]");
    if (!box) return;
    if (!list.length) { box.innerHTML = '<p class="admin-help">Nothing scheduled.</p>'; return; }
    box.innerHTML = list.map(function (r) {
      var when = formatDate(r.send_at);
      var cancel = r.status === "queued"
        ? '<button class="tiny-button danger" type="button" data-cancel-scheduled="' + r.id + '">Cancel</button>' : "";
      var detail = r.status === "queued"
        ? (r.recipient_count + " recipient" + (r.recipient_count === 1 ? "" : "s"))
        : (r.result || r.status);
      return '<article class="scheduled-item"><div><strong>' + esc(r.subject || "Untitled") + "</strong>" +
        "<span>" + esc(when) + " · " + esc(detail) + "</span></div>" +
        '<div class="scheduled-item-actions"><em class="sched-' + esc(r.status) + '">' + esc(r.status) + "</em>" + cancel + "</div></article>";
    }).join("");
    $$("[data-cancel-scheduled]", box).forEach(function (b) {
      b.addEventListener("click", function () { cancelScheduled(b.getAttribute("data-cancel-scheduled")); });
    });
  }

  function cancelScheduled(id) {
    if (!window.confirm("Cancel this scheduled send?")) return;
    fetch(ADMIN_API + "/campaign/scheduled/cancel", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: parseInt(id, 10) })
    })
      .then(function (res) { return responseJson(res); })
      .then(function () { loadScheduled(); })
      .catch(function (err) { status($("[data-send-status]"), friendly(err), "error"); });
  }

  /* --------------------------------------------------------------- */
  /* Birthday automation                                               */
  /* --------------------------------------------------------------- */

  function populateBirthdayHours() {
    var sel = $("[data-bday-hour]");
    if (!sel || sel.options.length) return;
    var html = "";
    for (var h = 0; h < 24; h += 1) {
      html += '<option value="' + h + '">' + (h < 10 ? "0" + h : h) + ":00</option>";
    }
    sel.innerHTML = html;
  }

  var BDAY_DEFAULTS = {
    subject: "Happy birthday from Lumi Derm 🎂",
    headline: "Happy birthday, {{name}}!",
    body: "Wishing you a wonderful day from all of us at Lumi Derm. To help you celebrate, enjoy a little birthday treat on your next visit this month.",
    ctaLabel: "Book your birthday treat",
    ctaUrl: BOOKING_URL
  };

  function bdayVal(sel) { var el = $(sel); return el ? String(el.value || "") : ""; }

  // Build a mail-like object from the friendly birthday fields.
  function birthdayMail() {
    return {
      subject: bdayVal("[data-bday-subject]") || BDAY_DEFAULTS.subject,
      preview: "",
      eyebrow: "",
      headline: bdayVal("[data-bday-headline]") || BDAY_DEFAULTS.headline,
      body: bdayVal("[data-bday-message]") || BDAY_DEFAULTS.body,
      ctaLabel: bdayVal("[data-bday-ctalabel]") || BDAY_DEFAULTS.ctaLabel,
      ctaUrl: bdayVal("[data-bday-ctaurl]") || BDAY_DEFAULTS.ctaUrl,
      heroImage: ""
    };
  }

  function updateBirthdayPreview() {
    var frame = $("[data-bday-preview]");
    if (frame) frame.srcdoc = renderEmail(birthdayMail(), true, []);
  }

  function loadBirthday() {
    populateBirthdayHours();
    fetch(ADMIN_API + "/settings/birthday", { cache: "no-store", credentials: "same-origin" })
      .then(function (res) { return responseJson(res); })
      .then(function (d) {
        var b = d.birthday || {};
        var f = b.fields || {};
        var set = function (sel, v) { var el = $(sel); if (el) el.value = v; };
        if ($("[data-bday-enabled]")) $("[data-bday-enabled]").checked = b.enabled === true;
        set("[data-bday-subject]", b.subject || BDAY_DEFAULTS.subject);
        set("[data-bday-headline]", f.headline || BDAY_DEFAULTS.headline);
        set("[data-bday-message]", f.body || BDAY_DEFAULTS.body);
        set("[data-bday-ctalabel]", f.ctaLabel || BDAY_DEFAULTS.ctaLabel);
        set("[data-bday-ctaurl]", f.ctaUrl || BDAY_DEFAULTS.ctaUrl);
        set("[data-bday-hour]", String(typeof b.hour === "number" ? b.hour : 8));
        updateBirthdayPreview();
      })
      .catch(function () { updateBirthdayPreview(); });
  }

  function saveBirthday() {
    var out = $("[data-bday-status]");
    var mail = birthdayMail();
    var payload = {
      enabled: ($("[data-bday-enabled]") || {}).checked === true,
      subject: mail.subject,
      hour: parseInt(($("[data-bday-hour]") || {}).value, 10),
      html: renderEmail(mail, false, []),          // branded HTML with {{name}}/{{unsubscribe}}
      fields: { headline: mail.headline, body: mail.body, ctaLabel: mail.ctaLabel, ctaUrl: mail.ctaUrl }
    };
    status(out, "Saving…");
    fetch(ADMIN_API + "/settings/birthday", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return responseJson(res); })
      .then(function (d) {
        status(out, d.birthday && d.birthday.enabled ? "Saved — birthday emails are ON." : "Saved — birthday emails are OFF.", "ok");
      })
      .catch(function (err) { status(out, friendly(err), "error"); });
  }

  function testBirthday() {
    var out = $("[data-bday-status]");
    var email = String(($("[data-bday-test-email]") || {}).value || "").trim();
    var mail = birthdayMail();
    status(out, "Sending preview…");
    fetch(ADMIN_API + "/settings/birthday/test", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: email, name: "Ana", subject: mail.subject, html: renderEmail(mail, false, []) })
    })
      .then(function (res) { return responseJson(res); })
      .then(function (d) { status(out, "Preview sent to " + d.sentTo + ". Check your inbox.", "ok"); })
      .catch(function (err) { status(out, friendly(err), "error"); });
  }

  function bindBirthday() {
    var save = $("[data-bday-save]"); if (save) save.addEventListener("click", saveBirthday);
    var test = $("[data-bday-test]"); if (test) test.addEventListener("click", testBirthday);
    ["[data-bday-subject]", "[data-bday-headline]", "[data-bday-message]", "[data-bday-ctalabel]", "[data-bday-ctaurl]"].forEach(function (sel) {
      var el = $(sel);
      if (el) el.addEventListener("input", updateBirthdayPreview);
    });
  }

  /* --------------------------------------------------------------- */
  /* Settings (Cloudflare Access)                                      */
  /* --------------------------------------------------------------- */

  function bindSettings() {
    var out = $("[data-mail-health-status]");

    var testBtn = $("[data-mail-health]");
    if (testBtn) {
      testBtn.addEventListener("click", function () {
        status(out, "Checking…");
        fetch(ADMIN_API + "/health", { cache: "no-store", credentials: "same-origin" })
          .then(function (res) {
            return responseJson(res);
          })
          .then(function (data) {
            var missing = [];
            if (!data.resend) missing.push("RESEND_API_KEY");
            if (!data.unsubSecret) missing.push("UNSUB_SECRET");
            if (!data.suppression) missing.push("SUPPRESSION KV");
            if (!data.subscribers) missing.push("SUBSCRIBERS D1");
            if (missing.length) {
              status(out, "Server is missing: " + missing.join(", ") + ".", "error");
            } else {
              status(out, "Ready for " + (data.adminEmail || "this Access user") + ". Sending from " + (data.from || "the configured address") + ".", "ok");
            }
          })
          .catch(function (err) {
            status(out, err.message || "No admin API found. Has the Worker been deployed?", "error");
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
    state.mail.ctaAuto = true;   // new template -> follow the ticked offer again
    syncFields();
    applyAutoCta();
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
      var nameEl = $("[data-campaign-name]");
      localStorage.setItem(
        DRAFT_STORE,
        JSON.stringify({
          name: nameEl ? nameEl.value.trim() : "",
          mail: state.mail,
          selected: state.selected,
          audienceSource: state.audienceSource,
          segment: currentSegment()
        })
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
        if (saved.name) {
          var nameEl = $("[data-campaign-name]");
          if (nameEl) nameEl.value = saved.name;
        }
        if (saved.audienceSource) {
          state.audienceSource = saved.audienceSource === "csv" ? "csv" : "website";
          var audience = $("[data-audience-source]");
          if (audience) audience.value = state.audienceSource;
        }
        if (saved.segment) setSegment(saved.segment);
        return true;
      }
    } catch (err) {
      /* ignore a corrupt draft */
    }
    return false;
  }

  function bindCompose() {
    var campaignName = $("[data-campaign-name]");
    if (campaignName) campaignName.addEventListener("input", saveDraft);

    $$("[data-mail-field]").forEach(function (field) {
      var key = field.getAttribute("data-mail-field");
      field.addEventListener("input", function () {
        if (key === "template") return;
        state.mail[key] = field.value;
        if (key === "ctaUrl") { state.mail.ctaAuto = false; updateCtaHint(); }
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
      select.addEventListener("change", function () {
        buildRecipients();
        renderCsvPreview();
      });
    });

    var audience = $("[data-audience-source]");
    if (audience) {
      audience.value = state.audienceSource;
      audience.addEventListener("change", function () {
        setAudienceSource(audience.value);
      });
    }

    // Segment filters re-filter the already-loaded subscribers.
    $$("[data-segment]").forEach(function (sel) {
      sel.addEventListener("change", applySegment);
    });

    var historyBtn = $("[data-history-reload]");
    if (historyBtn) historyBtn.addEventListener("click", loadHistory);

    bindCampaigns();
  }

  /* ---- Named campaign drafts (saved in this browser) ---- */
  /* ---- Named campaign drafts (saved in D1 via the Worker) ---- */
  function currentSegment() {
    var i = $('[data-segment="interest"]');
    var m = $('[data-segment="month"]');
    var s = $('[data-segment="confirmed_since"]');
    return { interest: i ? i.value : "", month: m ? m.value : "", confirmed_since: s ? s.value : "" };
  }
  function setSegment(segment) {
    var i = $('[data-segment="interest"]');
    var m = $('[data-segment="month"]');
    var s = $('[data-segment="confirmed_since"]');
    if (i) i.value = (segment && segment.interest) || "";
    if (m) m.value = (segment && segment.month) || "";
    if (s) s.value = (segment && segment.confirmed_since) || "";
  }
  function campaignPayload(id) {
    var nameEl = $("[data-campaign-name]");
    var name = nameEl ? nameEl.value.trim() : "";
    return {
      id: id || "",
      name: name,
      mail: JSON.parse(JSON.stringify(state.mail)),
      selected: JSON.parse(JSON.stringify(state.selected)),
      audienceSource: state.audienceSource,
      segment: currentSegment()
    };
  }
  function saveCampaign(existingId) {
    var nameEl = $("[data-campaign-name]");
    var name = nameEl ? nameEl.value.trim() : "";
    if (!name) {
      alert("Give the campaign a name first (top of Compose).");
      if (nameEl) nameEl.focus();
      return;
    }
    var btn = $("[data-campaign-save]");
    if (btn) btn.disabled = true;
    apiJson(ADMIN_API + "/campaign/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(campaignPayload(existingId || currentCampaignId))
    })
      .then(function (data) {
        if (data.draft && data.draft.id) currentCampaignId = data.draft.id;
        status($("[data-send-status]"), "Campaign saved.", "ok");
        loadCampaigns();
      })
      .catch(function (err) {
        status($("[data-send-status]"), friendly(err), "error");
      })
      .then(function () {
        if (btn) btn.disabled = false;
      });
  }
  function loadCampaignById(id) {
    var entry = campaignDrafts.filter(function (c) { return c.id === id; })[0];
    if (!entry) return;
    currentCampaignId = entry.id;
    state.mail = JSON.parse(JSON.stringify(entry.mail));
    state.selected = JSON.parse(JSON.stringify(entry.selected || {}));
    var nameEl = $("[data-campaign-name]");
    if (nameEl) nameEl.value = entry.name;
    syncFields();
    renderOfferPicker();
    applyAutoCta();
    // Restore audience + segment
    if (entry.audienceSource) {
      var audience = $("[data-audience-source]");
      if (audience) audience.value = entry.audienceSource;
      setAudienceSource(entry.audienceSource);
    }
    if (entry.segment) {
      setSegment(entry.segment);
      applySegment();
    }
    renderPreview();
    status($("[data-send-status]"), 'Loaded campaign "' + entry.name + '".', "ok");
  }
  function deleteCampaign(id) {
    apiJson(ADMIN_API + "/campaign/drafts/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: id })
    })
      .then(function () {
        if (currentCampaignId === id) currentCampaignId = "";
        status($("[data-send-status]"), "Campaign deleted.", "ok");
        loadCampaigns();
      })
      .catch(function (err) {
        status($("[data-send-status]"), friendly(err), "error");
      });
  }
  function loadCampaigns() {
    var box = $("[data-campaign-drafts]");
    if (!box) return;
    box.innerHTML = '<p class="admin-help">Loading saved campaigns…</p>';
    apiJson(ADMIN_API + "/campaign/drafts", { cache: "no-store" })
      .then(function (data) {
        campaignDrafts = data.drafts || [];
        renderCampaigns();
      })
      .catch(function (err) {
        campaignDrafts = [];
        box.innerHTML = '<p class="admin-status is-error">' + esc(friendly(err)) + "</p>";
      });
  }
  function renderCampaigns() {
    var box = $("[data-campaign-drafts]");
    if (!box) return;
    if (!campaignDrafts.length) {
      box.innerHTML = '<p class="admin-help">No saved campaigns yet.</p>';
      return;
    }
    box.innerHTML = campaignDrafts.map(function (c) {
      var seg = [];
      if (c.segment && c.segment.interest) seg.push(esc(c.segment.interest));
      if (c.segment && c.segment.month) seg.push("month " + esc(c.segment.month));
      if (c.segment && c.segment.confirmed_since) seg.push("since " + esc(c.segment.confirmed_since));
      var sub = esc((c.mail && c.mail.subject) || "(no subject)");
      return '<div class="campaign-draft">' +
        '<div class="campaign-draft-main"><strong>' + esc(c.name) + "</strong>" +
        '<span>' + sub + (seg.length ? " · " + seg.join(", ") : "") + "</span>" +
        '<small>Updated ' + esc(formatDate(c.updated_at || c.created_at)) + '</small></div>' +
        '<div class="campaign-draft-actions">' +
        '<button class="tiny-button" type="button" data-campaign-load="' + c.id + '">Load</button>' +
        '<button class="tiny-button tiny-danger" type="button" data-campaign-del="' + c.id + '">Delete</button>' +
        "</div></div>";
    }).join("");
    $$("[data-campaign-load]", box).forEach(function (b) {
      b.addEventListener("click", function () { loadCampaignById(b.getAttribute("data-campaign-load")); });
    });
    $$("[data-campaign-del]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        if (window.confirm("Delete this saved campaign?")) deleteCampaign(b.getAttribute("data-campaign-del"));
      });
    });
  }
  function bindCampaigns() {
    var saveBtn = $("[data-campaign-save]");
    if (saveBtn) saveBtn.addEventListener("click", saveCampaign);
    loadCampaigns();
  }

  function loadHistory() {
    var box = $("[data-campaign-history]");
    if (!box) return;
    box.innerHTML = '<p class="admin-help">Loading history…</p>';
    fetch(ADMIN_API + "/campaign/history", {
      cache: "no-store",
      credentials: "same-origin"
    })
      .then(function (res) {
        return responseJson(res);
      })
      .then(function (data) {
        var rows = data.history || [];
        if (!rows.length) {
          box.innerHTML = '<p class="admin-help">No campaigns have been sent yet.</p>';
          return;
        }
        box.innerHTML = rows.slice(0, 8).map(function (row) {
          var count = Number(row.sent_count || 0);
          var label = row.is_test ? "Test" : row.audience_source === "website" ? "Website subscribers" : "Treatwell CSV";
          var metrics = [
            count + " sent",
            Number(row.failed_count || 0) + " failed",
            Number(row.unsubscribe_count || 0) + " unsubscribed",
            Number(row.click_count || 0) + " clicks"
          ].join(" · ");
          return (
            '<article class="history-item">' +
            '<div><strong>' + esc(row.subject || "Untitled") + '</strong>' +
            '<span>' + esc(label) + " · " + esc(metrics) + " · " + esc(formatDate(row.created_at)) + '</span></div>' +
            '<em class="' + (row.status === "sent" ? "is-ok" : "is-warn") + '">' + esc(row.status || "sent") + '</em>' +
            '</article>'
          );
        }).join("");
      })
      .catch(function (err) {
        box.innerHTML = '<p class="admin-status is-error">' + esc(friendly(err)) + "</p>";
      });
  }

  function formatDate(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " +
      date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  /* --------------------------------------------------------------- */
  /* Init                                                              */
  /* --------------------------------------------------------------- */

  function init() {
    if (!document.getElementById("sender")) return;
    bindCompose();
    bindSending();
    bindBanner();
    bindSettings();
    bindBirthday();
    loadOffers();
    setAudienceSource(state.audienceSource);
    loadHistory();
    loadScheduled();
    loadBirthday();
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
