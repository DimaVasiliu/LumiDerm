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

  function renderAboutStats(stats) {
    return (Array.isArray(stats) ? stats : []).map(function (stat) {
      stat = stat || {};
      return '<div class="about-stat"><span class="about-stat-num">' + s(stat.num) +
        '</span><span class="about-stat-label">' + s(stat.label) + "</span></div>";
    }).join("");
  }

  function renderAboutImage(image) {
    image = image || {};
    var src = s(image.src);
    if (!src) return "";
    var attrs = 'src="' + esc(src) + '" alt="' + esc(image.alt || "") + '"';
    if (image.width) attrs += ' width="' + esc(image.width) + '"';
    if (image.height) attrs += ' height="' + esc(image.height) + '"';
    attrs += ' loading="lazy" decoding="async"';
    return "<img " + attrs + ">";
  }

  function renderAboutConcernCards(page) {
    page = page || {};
    var items = Array.isArray(page.items) ? page.items : [];
    return items.map(function (item) {
      item = item || {};
      return '<div class="page-card about-solve-card reveal" data-reveal>' +
        '<span class="about-chip">' + s(item.chip) + "</span>" +
        "<h3>" + s(item.title) + "</h3>" +
        "<p>" + s(item.copy) + "</p>" +
        '<p class="about-help">' + s(item.helpLabel || "How it helps:") + " <span>" + s(item.help) + "</span></p>" +
        "</div>";
    }).join("");
  }

  function benefitIcon(name) {
    var icons = {
      consultation: '<path d="M20 4H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3v4l5-4h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>',
      shield: '<path d="M12 3l7 3v5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
      star: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 21l-4.9 2.6.9-5.5-4-3.9L9.5 8z"/>',
      safety: '<path d="M12 3l7 3v5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z"/><path d="M12 8v4M12 15h.01"/>',
      plan: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3.5h6V6H9z"/><path d="M8.5 11h7M8.5 15h4.5"/>',
      studio: '<path d="M4 11l8-6 8 6"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>'
    };
    return icons[name] || icons.star;
  }

  function renderAboutBenefitCards(page) {
    page = page || {};
    var items = Array.isArray(page.items) ? page.items : [];
    return items.map(function (item) {
      item = item || {};
      return '<div class="page-card about-benefit reveal" data-reveal>' +
        '<span class="about-icon" aria-hidden="true"><svg viewBox="0 0 24 24">' + benefitIcon(s(item.icon)) + "</svg></span>" +
        "<h3>" + s(item.title) + "</h3>" +
        "<p>" + s(item.copy) + "</p>" +
        "</div>";
    }).join("");
  }

  function renderAboutJourneySteps(page) {
    page = page || {};
    var steps = Array.isArray(page.steps) ? page.steps : [];
    return steps.map(function (step, index) {
      step = step || {};
      return '<div class="timeline-step">' +
        '<span class="step-number">' + s(step.number || index + 1) + "</span>" +
        "<h3>" + s(step.title) + "</h3>" +
        "<p>" + s(step.copy) + "</p>" +
        "</div>";
    }).join("");
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

  // ---- FAQ (homepage) ----------------------------------------------------
  // The visible accordion rows between <!-- FAQ:START --> / <!-- FAQ:END -->.
  // Questions are plain text (HTML-escaped here); answers are trusted HTML
  // authored in the admin (may contain <a> links), emitted verbatim.
  function renderFaqRows(faq) {
    var items = Array.isArray(faq) ? faq : [];
    return items.map(function (item) {
      item = item || {};
      return '              <li class="faq-row">\n' +
        '                <button class="faq-q" type="button" data-faq-open aria-haspopup="dialog">\n' +
        '                  <span class="faq-q-text">' + esc(s(item.q)) + "</span>\n" +
        "                </button>\n" +
        '                <div class="faq-a-source" hidden>' + s(item.a) + "</div>\n" +
        "              </li>";
    }).join("\n");
  }

  function decodeEntities(t) {
    return s(t)
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/g, "'")
      .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); });
  }

  // Plain-text answer for the FAQPage structured data: strip tags, keep spacing.
  function faqPlain(a) {
    return decodeEntities(
      s(a)
        .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
        .replace(/<br\s*\/?>(?!$)/gi, " ")
        .replace(/<[^>]+>/g, "")
    ).replace(/\s+/g, " ").trim();
  }

  // The FAQPage object inside the JSON-LD @graph (regenerated on publish so the
  // structured data mirrors the visible accordion). Returns valid, indented JSON.
  function renderFaqJsonLd(faq) {
    var items = Array.isArray(faq) ? faq : [];
    var questions = items.map(function (item) {
      item = item || {};
      return "        {\n" +
        '          "@type": "Question",\n' +
        '          "name": ' + JSON.stringify(decodeEntities(s(item.q))) + ",\n" +
        '          "acceptedAnswer": {\n' +
        '            "@type": "Answer",\n' +
        '            "text": ' + JSON.stringify(faqPlain(item.a)) + "\n" +
        "          }\n" +
        "        }";
    }).join(",\n");
    return "{\n" +
      '      "@type": "FAQPage",\n' +
      '      "mainEntity": [\n' +
      questions + "\n" +
      "      ]\n" +
      "    }";
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
    renderAboutStats: renderAboutStats,
    renderAboutImage: renderAboutImage,
    renderAboutConcernCards: renderAboutConcernCards,
    renderAboutBenefitCards: renderAboutBenefitCards,
    renderAboutJourneySteps: renderAboutJourneySteps,
    renderSectionHeader: renderSectionHeader,
    renderAboutCta: renderAboutCta,
    renderFaqRows: renderFaqRows,
    renderFaqJsonLd: renderFaqJsonLd
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) Object.keys(api).forEach(function (key) { root[key] = api[key]; });
})(typeof window !== "undefined" ? window : null);
