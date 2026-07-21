/**
 * Lumi Derm — admin Subscribers tab
 * ------------------------------------------------------------------
 * Lists newsletter subscribers from the Access-protected Worker admin API,
 * shows consent status, exports confirmed contacts to CSV (to feed the
 * email sender), and deletes a subscriber on request (right to erasure).
 * Cloudflare Access protects this admin route before the API is reached.
 */
(function () {
  "use strict";

  var ADMIN_API = "/admin/api";

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function status(msg, kind) {
    var el = $("[data-subs-status]");
    if (!el) return;
    el.textContent = msg;
    el.className = "admin-status" + (kind ? " is-" + kind : "");
  }
  function friendly(err) {
    return window.ldFriendlyError ? window.ldFriendlyError(err) : ((err && err.message) || String(err));
  }
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
      if (!res.ok) throw new Error(data.error || "Could not load (" + res.status + ").");
      return data;
    });
  }

  var MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTH_LOOKUP = {
    jan: "1", january: "1", feb: "2", february: "2", mar: "3", march: "3",
    apr: "4", april: "4", may: "5", jun: "6", june: "6", jul: "7", july: "7",
    aug: "8", august: "8", sep: "9", sept: "9", september: "9", oct: "10",
    october: "10", nov: "11", november: "11", dec: "12", december: "12"
  };
  function birthday(r) {
    if (!r.birth_day || !r.birth_month) return "";
    return r.birth_day + " " + (MONTHS[r.birth_month] || "");
  }
  function fullName(r) {
    return [r.first_name, r.last_name].filter(Boolean).join(" ");
  }
  function whenLabel(r) {
    var d = r.confirmed_at || r.created_at;
    if (!d) return "";
    var dt = new Date(d);
    return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString("en-GB",
      { day: "numeric", month: "short", year: "numeric" });
  }
  function looksConsented(value) {
    var v = String(value == null ? "" : value).trim().toLowerCase();
    return ["yes", "y", "true", "1", "opted in", "opted-in", "subscribed", "consented", "x", "✓"].indexOf(v) !== -1;
  }
  function parseCsv(text) {
    var rows = [], row = [], field = "", inQuotes = false, i = 0;
    text = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    while (i < text.length) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i += 1; continue;
        }
        field += ch; i += 1; continue;
      }
      if (ch === '"') { inQuotes = true; i += 1; continue; }
      if (ch === ",") { row.push(field); field = ""; i += 1; continue; }
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 1; continue; }
      field += ch; i += 1;
    }
    row.push(field); rows.push(row);
    return rows.filter(function (r) { return r.some(function (cell) { return String(cell).trim() !== ""; }); });
  }
  function findCol(headers, names) {
    for (var n = 0; n < names.length; n += 1) {
      for (var h = 0; h < headers.length; h += 1) {
        if (headers[h].indexOf(names[n]) !== -1) return h;
      }
    }
    return -1;
  }
  function birthdayParts(value) {
    var s = String(value || "").trim();
    if (!s) return { day: "", month: "" };
    var parts = s.split(/[\/\-\s.]+/).filter(Boolean);
    if (parts.length >= 2) return { day: parts[0], month: MONTH_LOOKUP[String(parts[1]).toLowerCase()] || parts[1] };
    return { day: "", month: "" };
  }

  var cache = [];
  var searchTerm = "";

  function render(data) {
    cache = data.subscribers || [];
    var counts = data.counts || {};
    var c = $("[data-subs-count-confirmed]");
    var p = $("[data-subs-count-pending]");
    var u = $("[data-subs-count-unsub]");
    if (c) c.textContent = counts.confirmed || 0;
    if (p) p.textContent = counts.pending || 0;
    if (u) u.textContent = counts.unsubscribed || 0;
    renderRows();
  }

  function renderRows() {
    var body = $("[data-subs-body]");
    if (!body) return;
    if (!cache.length) {
      body.innerHTML = '<tr><td colspan="7" class="subs-empty">No subscribers yet.</td></tr>';
      return;
    }
    var q = searchTerm.trim().toLowerCase();
    var rows = q
      ? cache.filter(function (r) {
          return (fullName(r) + " " + (r.email || "")).toLowerCase().indexOf(q) !== -1;
        })
      : cache;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="subs-empty">No one matches &ldquo;' + esc(searchTerm) + '&rdquo;.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (r) {
      var badge = '<span class="subs-badge subs-' + esc(r.status) + '">' + esc(r.status) + "</span>";
      var consentTitle = [
        r.consent_source ? "Source: " + r.consent_source : "",
        r.consent_wording ? "Wording: " + r.consent_wording : ""
      ].filter(Boolean).join("\n");
      var consent = r.consent_email
        ? '<span class="subs-consent" title="' + esc(consentTitle || ("Consented " + whenLabel(r))) + '">Yes &middot; ' + esc(whenLabel(r)) + '<small>' + esc(r.consent_source || "website") + '</small></span>'
        : "No";
      return "<tr>" +
        "<td>" + esc(fullName(r) || "—") + "</td>" +
        "<td>" + esc(r.email) + "</td>" +
        "<td>" + badge + "</td>" +
        "<td>" + consent + "</td>" +
        "<td>" + esc(birthday(r) || "—") + "</td>" +
        "<td>" + esc(r.interest || "—") + "</td>" +
        '<td><button class="admin-button admin-button-ghost subs-del" type="button" data-subs-del="' +
          esc(r.email) + '">Delete</button></td>' +
      "</tr>";
    }).join("");

    Array.prototype.forEach.call(body.querySelectorAll("[data-subs-del]"), function (btn) {
      btn.addEventListener("click", function () { del(btn.getAttribute("data-subs-del")); });
    });
  }

  function load() {
    status("Loading…");
    fetch(ADMIN_API + "/subscribers", { cache: "no-store", credentials: "same-origin" })
      .then(function (res) {
        return responseJson(res);
      })
      .then(function (data) {
        render(data);
        status(data.total + " subscriber" + (data.total === 1 ? "" : "s") + " total.", "ok");
      })
      .catch(function (err) { status(friendly(err), "error"); });
  }

  function del(email) {
    if (!email) return;
    confirmModal({
      title: "Delete this subscriber?",
      body: "Permanently delete " + email + " and their consent record. This is used for the right to erasure and cannot be undone.",
      confirmLabel: "Delete permanently",
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      fetch(ADMIN_API + "/subscribers/delete", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email })
      })
        .then(function (res) { return responseJson(res); })
        .then(function () { status("Deleted " + email + ".", "ok"); load(); })
        .catch(function (err) { status(friendly(err), "error"); });
    });
  }

  function exportCsv() {
    var confirmed = cache.filter(function (r) { return r.status === "confirmed"; });
    if (!confirmed.length) { status("No confirmed subscribers to export yet.", "error"); return; }
    confirmModal({
      title: "Export subscriber personal data?",
      body: "This downloads confirmed subscribers from D1 as a CSV containing personal data. Keep the file private and delete old copies when you no longer need them.",
      confirmLabel: "Export CSV"
    }).then(function (ok) {
      if (!ok) return;
      doExportCsv(confirmed);
    });
  }

  function doExportCsv(confirmed) {
    var rows = [["first name", "last name", "email", "birthday", "interest", "consent", "confirmed date"]];
    confirmed.forEach(function (r) {
      rows.push([
        r.first_name || "", r.last_name || "", r.email,
        birthday(r), r.interest || "",
        r.consent_email ? "yes" : "no", whenLabel(r)
      ]);
    });
    var csv = rows.map(function (row) {
      return row.map(function (cell) {
        var s = String(cell == null ? "" : cell);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(",");
    }).join("\n");
    var blob = new Blob([csv], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lumi-derm-subscribers-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    status("Exported " + confirmed.length + " confirmed subscriber(s).", "ok");
    // Record the export in the server-side audit log (OWASP: log data exports).
    fetch(ADMIN_API + "/audit", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "subscriber.export", detail: confirmed.length + " confirmed contacts" })
    }).catch(function () { /* best-effort */ });
  }

  function importCsvFile(file) {
    if (!file) return;
    confirmModal({
      title: "Import subscriber personal data?",
      body: "Only import people who clearly gave marketing consent. This writes contacts into the D1 subscriber database and records them as manually imported consent.",
      confirmLabel: "Import subscribers"
    }).then(function (ok) {
      if (!ok) return;
      var reader = new FileReader();
      reader.onerror = function () { status("Could not read that CSV file.", "error"); };
      reader.onload = function () {
        var rows = parseCsv(reader.result);
        if (rows.length < 2) { status("That CSV looks empty.", "error"); return; }
        var headers = rows[0].map(function (h) { return String(h || "").trim().toLowerCase(); });
        var emailCol = findCol(headers, ["email", "e-mail"]);
        var firstCol = findCol(headers, ["first name", "firstname", "first"]);
        var lastCol = findCol(headers, ["last name", "lastname", "surname", "last"]);
        var birthdayCol = findCol(headers, ["birthday", "birth date", "dob", "date of birth"]);
        var dayCol = findCol(headers, ["birth day", "birthday day", "day"]);
        var monthCol = findCol(headers, ["birth month", "birthday month", "month"]);
        var interestCol = findCol(headers, ["interest", "interested"]);
        var consentCol = findCol(headers, ["consent", "marketing", "opt-in", "opt in", "subscribed"]);
        if (emailCol < 0) { status("Import needs an email column.", "error"); return; }
        if (consentCol < 0) { status("Import needs a consent / marketing opt-in column.", "error"); return; }
        var list = rows.slice(1).map(function (r) {
          var bp = birthdayParts(birthdayCol >= 0 ? r[birthdayCol] : "");
          return {
            first_name: firstCol >= 0 ? r[firstCol] : "",
            last_name: lastCol >= 0 ? r[lastCol] : "",
            email: r[emailCol],
            birth_day: dayCol >= 0 ? r[dayCol] : bp.day,
            birth_month: monthCol >= 0 ? r[monthCol] : bp.month,
            interest: interestCol >= 0 ? r[interestCol] : "",
            consent_email: looksConsented(r[consentCol])
          };
        });
        status("Importing " + list.length + " row(s)…");
        fetch(ADMIN_API + "/subscribers/import", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: "admin CSV import",
            consent_wording: "Manually imported with recorded marketing consent.",
            subscribers: list
          })
        })
          .then(function (res) { return responseJson(res); })
          .then(function (data) {
            status("Imported " + data.imported + ", updated " + data.updated + ". Skipped " + (data.invalid + data.skippedNoConsent + data.skippedSuppressed + data.skippedUnsubscribed) + ".", "ok");
            load();
          })
          .catch(function (err) { status(friendly(err), "error"); });
      };
      reader.readAsText(file);
    });
  }

  function init() {
    if (!document.getElementById("subscribers")) return;
    var reload = $("[data-subs-reload]");
    var exp = $("[data-subs-export]");
    var imp = $("[data-subs-import]");
    var impFile = $("[data-subs-import-file]");
    if (reload) reload.addEventListener("click", load);
    if (exp) exp.addEventListener("click", exportCsv);
    if (imp && impFile) imp.addEventListener("click", function () { impFile.click(); });
    if (impFile) impFile.addEventListener("change", function () {
      importCsvFile(impFile.files && impFile.files[0]);
      impFile.value = "";
    });
    var search = $("[data-subs-search]");
    if (search) search.addEventListener("input", function () {
      searchTerm = search.value || "";
      renderRows();
    });
    // Load when the Subscribers tab is first opened.
    var navBtn = document.querySelector('[data-admin-panel="subscribers"]');
    var loadedOnce = false;
    if (navBtn) {
      navBtn.addEventListener("click", function () {
        if (!loadedOnce) { loadedOnce = true; load(); }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
