/**
 * Lumi Derm — admin Subscribers tab
 * ------------------------------------------------------------------
 * Lists newsletter subscribers from the Worker (/api/subscribers),
 * shows consent status, exports confirmed contacts to CSV (to feed the
 * email sender), and deletes a subscriber on request (right to erasure).
 * Uses the same send key as the campaign sender.
 */
(function () {
  "use strict";

  var KEY_STORE = "lumi-derm-mail-key-v1"; // same key the sender uses

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function getKey() {
    try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; }
  }
  function status(msg, kind) {
    var el = $("[data-subs-status]");
    if (!el) return;
    el.textContent = msg;
    el.className = "admin-status" + (kind ? " is-" + kind : "");
  }

  var MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

  var cache = [];

  function render(data) {
    cache = data.subscribers || [];
    var counts = data.counts || {};
    var c = $("[data-subs-count-confirmed]");
    var p = $("[data-subs-count-pending]");
    var u = $("[data-subs-count-unsub]");
    if (c) c.textContent = counts.confirmed || 0;
    if (p) p.textContent = counts.pending || 0;
    if (u) u.textContent = counts.unsubscribed || 0;

    var body = $("[data-subs-body]");
    if (!body) return;
    if (!cache.length) {
      body.innerHTML = '<tr><td colspan="7" class="subs-empty">No subscribers yet.</td></tr>';
      return;
    }
    body.innerHTML = cache.map(function (r) {
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
    var key = getKey();
    if (!key) {
      status("Add your send key in Settings → Sending connection first.", "error");
      return;
    }
    status("Loading…");
    fetch("/api/subscribers", { headers: { "x-lumi-key": key }, cache: "no-store" })
      .then(function (res) {
        return res.json().then(function (payload) {
          if (!res.ok) throw new Error(payload.error || "Could not load (" + res.status + ").");
          return payload;
        });
      })
      .then(function (data) {
        render(data);
        status(data.total + " subscriber" + (data.total === 1 ? "" : "s") + " total.", "ok");
      })
      .catch(function (err) { status(err.message, "error"); });
  }

  function del(email) {
    if (!email) return;
    if (!window.confirm("Delete " + email + " permanently? This cannot be undone.")) return;
    var key = getKey();
    fetch("/api/subscribers/delete", {
      method: "POST",
      headers: { "content-type": "application/json", "x-lumi-key": key },
      body: JSON.stringify({ email: email })
    })
      .then(function (res) { return res.json().then(function (p) {
        if (!res.ok) throw new Error(p.error || "Delete failed."); return p; }); })
      .then(function () { status("Deleted " + email + ".", "ok"); load(); })
      .catch(function (err) { status(err.message, "error"); });
  }

  function exportCsv() {
    var confirmed = cache.filter(function (r) { return r.status === "confirmed"; });
    if (!confirmed.length) { status("No confirmed subscribers to export yet.", "error"); return; }
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
  }

  function init() {
    if (!document.getElementById("subscribers")) return;
    var reload = $("[data-subs-reload]");
    var exp = $("[data-subs-export]");
    if (reload) reload.addEventListener("click", load);
    if (exp) exp.addEventListener("click", exportCsv);
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
