/**
 * Lumi Derm — treatment-library renderer
 * ------------------------------------------------------------------
 * Turns the structured prices.json into the exact HTML markup used on
 * the Treatments & prices page (pages/services.html), between the
 * <!-- PRICES:START --> / <!-- PRICES:END --> markers.
 *
 * This is the single source of truth for that markup. The admin calls
 * renderTreatmentLibrary(data) at publish time to regenerate the static
 * section, so Google always sees real prices in the page source.
 *
 * Dependency-free. Runs in the browser (window.renderTreatmentLibrary)
 * and in Node (module.exports) so it can be unit-tested.
 */
(function (root) {
  "use strict";

  function s(v) { return v == null ? "" : String(v); }

  // Values in prices.json are stored as verbatim inner-HTML (already
  // escaped, e.g. "Face &amp; body"), so they are emitted as-is.
  function renderBlock(b) {
    switch (b.type) {
      case "p":
        return "<p>" + s(b.html) + "</p>";
      case "subhead":
        return '<p class="tx-subhead">' + s(b.text) + "</p>";
      case "note":
        return '<p class="tx-note">' + s(b.text) + "</p>";
      case "pill":
        return '<span class="tx-pill">' + s(b.text) + "</span>";
      case "table": {
        var head = "<thead><tr>" +
          (b.columns || []).map(function (c) { return "<th>" + s(c) + "</th>"; }).join("") +
          "</tr></thead>";
        var body = "<tbody>" +
          (b.rows || []).map(function (row) {
            return "<tr>" + row.map(function (cell) { return "<td>" + s(cell) + "</td>"; }).join("") + "</tr>";
          }).join("") +
          "</tbody>";
        return '<table class="tx-pricetable">' + head + body + "</table>";
      }
      case "pricelist": {
        var rows = (b.rows || []).map(function (r) {
          var cost = s(r.cost) + (r.costSmall ? "<small>" + s(r.costSmall) + "</small>" : "");
          return '<div class="tx-row"><span class="tx-name">' + s(r.name) +
            '</span><span class="tx-cost">' + cost + "</span></div>";
        }).join("");
        return '<div class="tx-pricelist">' + rows + "</div>";
      }
      default:
        return "";
    }
  }

  function renderTreatment(tx) {
    var detail = (tx.detail || []).map(renderBlock).join("");
    var href = tx.service ? "booking.html?service=" + s(tx.service) : "booking.html";
    var actions = '<div class="tx-actions"><a class="btn btn-primary" href="' + href + '">' +
      s(tx.bookLabel) + "</a></div>";
    return '<div class="tx-card" id="' + s(tx.id) + '" data-tx-card>' +
      '<button class="tx-card-btn" type="button" data-tx-open>' +
      '<span class="tx-head"><span class="tx-title">' + s(tx.title) + "</span>" +
      '<span class="tx-sub">' + s(tx.sub) + "</span></span>" +
      '<span class="tx-price">' + s(tx.headline) + "</span>" +
      "</button>" +
      '<div class="tx-card-detail" hidden><div class="tx-detail">' +
      detail + actions +
      "</div></div>" +
      "</div>";
  }

  function renderGroup(g) {
    var cards = (g.treatments || []).map(renderTreatment).join("");
    return '<section class="treatment-group">' +
      '<h2 class="treatment-group-title">' + s(g.title) + "</h2>" +
      '<div class="faq-list treatment-list">' + cards + "</div>" +
      "</section>";
  }

  function renderTreatmentLibrary(data) {
    var groups = (data && data.groups) || [];
    return groups.map(renderGroup).join("");
  }

  var api = { renderTreatmentLibrary: renderTreatmentLibrary };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.renderTreatmentLibrary = renderTreatmentLibrary;
})(typeof window !== "undefined" ? window : null);
