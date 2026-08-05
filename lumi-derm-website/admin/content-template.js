/**
 * Lumi Derm — homepage hero renderer
 * ------------------------------------------------------------------
 * Turns content.json text objects into the exact marked HTML blocks used by
 * the public pages. Admin publishing rewrites only those marked blocks.
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
  function paragraphs(items) {
    return (Array.isArray(items) ? items : []).map(function (item) {
      return "<p>" + s(item) + "</p>";
    }).join("");
  }

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

  function renderSimpleHero(page) {
    page = page || {};
    return '<p class="eyebrow">' + s(page.eyebrow) + "</p>" +
      "<h1>" + s(page.title) + "</h1>" +
      '<p class="lead' + (page.leadClass ? " " + s(page.leadClass) : "") + '">' + s(page.lead) + "</p>";
  }

  function renderBookingHero(page) {
    page = page || {};
    return '<p class="eyebrow">' + s(page.eyebrow) + "</p>" +
      "<h1>" + s(page.title) + "</h1>";
  }

  function renderBookingPicker(page) {
    page = page || {};
    return '<p class="eyebrow">' + s(page.eyebrow) + "</p>" +
      '<h2 id="booking-picker-title">' + s(page.title) + "</h2>" +
      '<p data-booking-picker-copy>' + s(page.copy) + "</p>" +
      '<button class="booking-change-link" type="button" data-booking-change hidden>Change treatment</button>';
  }

  function renderBookingSupport(page) {
    page = page || {};
    return "<div>" +
      "<strong>" + s(page.title) + "</strong>" +
      "<p>" + s(page.copy) + "</p>" +
      "</div>" +
      '<div class="booking-support-actions">' +
      '<button class="btn btn-primary" type="button" data-booking-open-widget>Load calendar</button>' +
      '<a class="btn btn-ghost" href="tel:07832839298">Call 07832839298</a>' +
      "</div>";
  }

  function renderBookingWidget(page) {
    page = page || {};
    return '<p class="eyebrow">' + s(page.eyebrow) + "</p>" +
      '<h2 id="booking-calendar-title">' + s(page.title) + "</h2>" +
      '<p data-booking-widget-hint>' + s(page.copy) + "</p>";
  }

  function renderAboutBio(page) {
    page = page || {};
    return '<p class="eyebrow">' + s(page.eyebrow) + "</p>" +
      "<h2>" + s(page.title) + "</h2>" +
      paragraphs(page.paragraphs) +
      '<p class="about-sign">' + s(page.signature) + "<span>" + s(page.role) + "</span></p>";
  }

  function renderAboutClinic(page) {
    page = page || {};
    var cards = Array.isArray(page.cards) ? page.cards : [];
    return '<p class="eyebrow">' + s(page.eyebrow) + "</p>" +
      "<h2>" + s(page.title) + "</h2>" +
      "<p>" + s(page.lead) + "</p>" +
      '<div class="about-venue-grid">' +
      cards.map(function (card) {
        return "<div><h3>" + s(card.title) + "</h3><p>" + s(card.copy) + "</p></div>";
      }).join("") +
      "</div>";
  }

  function renderSectionHeader(page) {
    page = page || {};
    return '<p class="eyebrow">' + s(page.eyebrow) + "</p>" +
      "<h2>" + s(page.title) + "</h2>" +
      (page.copy ? "<p>" + s(page.copy) + "</p>" : "");
  }

  function renderAboutCta(page) {
    page = page || {};
    return '<div class="about-cta-text">' +
      "<h2>" + s(page.title) + "</h2>" +
      "<p>" + s(page.copy) + "</p>" +
      "</div>" +
      '<div class="about-cta-actions">' +
      '<a class="btn btn-primary" href="booking.html">Book a consultation</a>' +
      '<a class="btn btn-secondary" href="../index.html#contact">Contact the studio</a>' +
      "</div>";
  }

  function esc(v) {
    return s(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // The homepage <head> SEO block: title + description (+ Open Graph mirrors).
  // Replaces everything between <!-- SEO:START --> and <!-- SEO:END -->.
  function renderSeo(seo) {
    seo = seo || {};
    var title = s(seo.title).trim() || "Lumi Derm Aesthetics | Advanced Beauty & Skin Treatments";
    var desc = s(seo.description).trim();
    return '<title>' + esc(title) + "</title>\n" +
      '    <meta name="description" content="' + esc(desc) + '">\n' +
      '    <meta property="og:title" content="' + esc(title) + '">\n' +
      '    <meta property="og:description" content="' + esc(desc) + '">';
  }

  var api = {
    renderHero: renderHero,
    renderSeo: renderSeo,
    renderSimpleHero: renderSimpleHero,
    renderBookingHero: renderBookingHero,
    renderBookingPicker: renderBookingPicker,
    renderBookingWidget: renderBookingWidget,
    renderBookingSupport: renderBookingSupport,
    renderAboutBio: renderAboutBio,
    renderAboutClinic: renderAboutClinic,
    renderSectionHeader: renderSectionHeader,
    renderAboutCta: renderAboutCta
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) Object.keys(api).forEach(function (key) { root[key] = api[key]; });
})(typeof window !== "undefined" ? window : null);
