/**
 * Lumi Derm — homepage hero renderer
 * ------------------------------------------------------------------
 * Turns content.json's `hero` object into the exact markup used inside
 * <div class="hero-content"> on index.html, between the
 * <!-- HERO:START --> / <!-- HERO:END --> markers.
 *
 * Editable: eyebrow, title (may contain <br>), lead. The microdetail
 * line and the two action buttons are fixed. Values are stored verbatim
 * (already HTML-encoded, e.g. "&mdash;") and emitted as-is.
 *
 * Dependency-free: browser (window.renderHero) and Node (module.exports).
 */
(function (root) {
  "use strict";
  function s(v) { return v == null ? "" : String(v); }

  function renderHero(hero) {
    hero = hero || {};
    return '<p class="hero-eyebrow"><span class="hero-eyebrow-rule" aria-hidden="true"></span>' + s(hero.eyebrow) + "</p>" +
      '<h1 class="hero-title">' + s(hero.title) + "</h1>" +
      '<p class="hero-lead">' + s(hero.lead) + "</p>" +
      '<p class="hero-microdetail"><span class="hero-microdetail-line" aria-hidden="true"></span>Tailored treatment plans</p>' +
      '<div class="hero-actions">' +
      '<a class="btn btn-primary" href="pages/booking.html">Book your consultation</a>' +
      '<a class="btn btn-secondary" href="pages/services.html">Explore treatments</a>' +
      "</div>";
  }

  var api = { renderHero: renderHero };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.renderHero = renderHero;
})(typeof window !== "undefined" ? window : null);
