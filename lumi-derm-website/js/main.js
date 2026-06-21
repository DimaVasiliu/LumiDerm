const header = document.querySelector("[data-header]");
const navToggle = document.querySelector("[data-nav-toggle]");
const navMenu = document.querySelector("[data-nav-menu]");
const faqButtons = document.querySelectorAll("[data-faq-button]");
const revealItems = document.querySelectorAll("[data-reveal]");
const filterButtons = document.querySelectorAll("[data-filter]");
const treatmentCards = document.querySelectorAll("[data-treatment-category]");
const currentPath = window.location.pathname.split("/").pop() || "index.html";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function setHeaderState() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 18);
}

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });

if (navToggle && navMenu) {
  navMenu.setAttribute("aria-hidden", "true");

  function closeMobileMenu() {
    navToggle.setAttribute("aria-expanded", "false");
    navMenu.setAttribute("aria-hidden", "true");
    navMenu.classList.remove("is-open");
    navMenu.style.zIndex = "";
    header?.classList.remove("menu-active");
    document.body.classList.remove("menu-open");
  }

  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!isOpen));
    navMenu.setAttribute("aria-hidden", String(isOpen));
    navMenu.classList.toggle("is-open", !isOpen);
    navMenu.style.zIndex = !isOpen ? "10010" : "";
    header?.classList.toggle("menu-active", !isOpen);
    document.body.classList.toggle("menu-open", !isOpen);
  });

  navMenu.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLAnchorElement)) return;
    closeMobileMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeMobileMenu();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth < 980) return;
    closeMobileMenu();
  });
}

document.querySelectorAll("a[href^='#']").forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");
    if (!href || href === "#") return;
    const target = document.querySelector(href);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

faqButtons.forEach((button) => {
  const answer = document.getElementById(button.getAttribute("aria-controls"));
  button.addEventListener("click", () => {
    const isExpanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!isExpanded));
    if (answer) {
      answer.style.maxHeight = isExpanded ? "0px" : `${answer.scrollHeight}px`;
    }
  });
});

function initPriceAccordions() {
  const priceButtons = document.querySelectorAll("[data-price-toggle]");
  const priceFilters = document.querySelectorAll("[data-price-filter]");
  const priceCards = document.querySelectorAll("[data-price-group]");
  if (!priceButtons.length) return;

  function setPanel(button, expanded) {
    const card = button.closest(".price-accordion");
    const panel = document.getElementById(button.getAttribute("aria-controls"));
    if (!panel) return;
    button.setAttribute("aria-expanded", String(expanded));
    card?.classList.toggle("is-open", expanded);
    panel.style.maxHeight = expanded ? `${panel.scrollHeight}px` : "0px";
  }

  function applyPriceFilter(filter = "popular") {
    priceFilters.forEach((button) => {
      const isActive = button.dataset.priceFilter === filter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    priceCards.forEach((card) => {
      const groups = (card.dataset.priceGroup || "").split(" ");
      const isVisible = filter === "all" || groups.includes(filter);
      card.classList.toggle("is-hidden", !isVisible);

      if (!isVisible) {
        const button = card.querySelector("[data-price-toggle]");
        if (button) setPanel(button, false);
      }
    });
  }

  priceButtons.forEach((button) => {
    setPanel(button, button.getAttribute("aria-expanded") === "true");
    button.addEventListener("click", () => {
      const isExpanded = button.getAttribute("aria-expanded") === "true";
      setPanel(button, !isExpanded);
    });
  });

  priceFilters.forEach((button) => {
    button.addEventListener("click", () => {
      applyPriceFilter(button.dataset.priceFilter || "popular");
    });
  });

  applyPriceFilter("popular");

  window.addEventListener("resize", () => {
    priceButtons.forEach((button) => {
      if (button.getAttribute("aria-expanded") === "true") {
        setPanel(button, true);
      }
    });
  });
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter || "all";
    filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    treatmentCards.forEach((card) => {
      const categories = (card.dataset.treatmentCategory || "").split(" ");
      card.classList.toggle("is-hidden", filter !== "all" && !categories.includes(filter));
    });
  });
});

function initFallbackReveals() {
  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -42px 0px" }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}

function initGsapMotion() {
  if (prefersReducedMotion || !window.gsap || !window.ScrollTrigger) {
    initFallbackReveals();
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  revealItems.forEach((item) => item.classList.add("is-visible"));

  gsap.utils.toArray("[data-animate='fade-up']").forEach((item) => {
    gsap.from(item, {
      scrollTrigger: {
        trigger: item,
        start: "top 86%",
        once: true
      },
      y: 42,
      opacity: 0,
      duration: 0.82,
      ease: "power3.out",
      immediateRender: false
    });
  });

  gsap.utils.toArray(".treatment-card, .price-card, .review-card, .gallery-item").forEach((item, index) => {
    gsap.from(item, {
      scrollTrigger: {
        trigger: item,
        start: "top 90%",
        once: true
      },
      y: 38,
      opacity: 0,
      duration: 0.68,
      delay: (index % 3) * 0.05,
      ease: "power2.out",
      immediateRender: false
    });
  });

}

function initCarousels() {
  document.querySelectorAll("[data-carousel]").forEach((carousel) => {
    const track = carousel.querySelector(".carousel-track");
    const slides = Array.from(carousel.querySelectorAll(".carousel-slide, .offer-slide"));
    const prev = carousel.querySelector("[data-carousel-prev]");
    const next = carousel.querySelector("[data-carousel-next]");
    const dotsWrap = carousel.querySelector("[data-carousel-dots]");
    if (!track || slides.length < 2 || !dotsWrap) return;

    let index = 0;
    let timer;
    const dots = slides.map((_, dotIndex) => {
      const button = document.createElement("button");
      button.className = "carousel-dot";
      button.type = "button";
      button.setAttribute("aria-label", `Go to treatment ${dotIndex + 1}`);
      button.addEventListener("click", () => goTo(dotIndex, true));
      dotsWrap.appendChild(button);
      return button;
    });

    function update() {
      track.style.transform = `translateX(-${index * 100}%)`;
      slides.forEach((slide, slideIndex) => slide.classList.toggle("is-active", slideIndex === index));
      dots.forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex === index));
    }

    function goTo(nextIndex, userAction = false) {
      index = (nextIndex + slides.length) % slides.length;
      update();
      if (userAction) restart();
    }

    function start() {
      if (prefersReducedMotion) return;
      timer = window.setInterval(() => goTo(index + 1), 4800);
    }

    function stop() {
      window.clearInterval(timer);
    }

    function restart() {
      stop();
      start();
    }

    prev?.addEventListener("click", () => goTo(index - 1, true));
    next?.addEventListener("click", () => goTo(index + 1, true));
    carousel.addEventListener("mouseenter", stop);
    carousel.addEventListener("mouseleave", start);
    carousel.addEventListener("focusin", stop);
    carousel.addEventListener("focusout", start);
    update();
    start();
  });
}

function initOffersCarousel() {
  const carousel = document.querySelector("[data-offers-carousel]");
  if (!carousel) return;
  const track = carousel.querySelector("[data-offers-track]");
  const originalSlides = Array.from(carousel.querySelectorAll(".offer-slide"));
  const prev = document.querySelector("[data-offers-prev]");
  const next = document.querySelector("[data-offers-next]");
  const dotsWrap = document.querySelector("[data-offers-dots]");
  if (!track || originalSlides.length < 2) return;

  originalSlides.forEach((slide) => {
    const beforeClone = slide.cloneNode(true);
    const afterClone = slide.cloneNode(true);
    beforeClone.classList.add("is-clone");
    afterClone.classList.add("is-clone");
    beforeClone.setAttribute("aria-hidden", "true");
    afterClone.setAttribute("aria-hidden", "true");
    beforeClone.querySelectorAll("a, button").forEach((item) => item.setAttribute("tabindex", "-1"));
    afterClone.querySelectorAll("a, button").forEach((item) => item.setAttribute("tabindex", "-1"));
    track.insertBefore(beforeClone, track.firstChild);
    track.appendChild(afterClone);
  });

  const slides = Array.from(track.querySelectorAll(".offer-slide"));
  const loopStart = originalSlides.length;

  let index = loopStart;
  let step = 0;
  let timer;
  let dots = [];

  function normalizedIndex() {
    return ((index - loopStart) % originalSlides.length + originalSlides.length) % originalSlides.length;
  }

  function setTrackPosition(withTransition = true) {
    track.style.transition = withTransition ? "" : "none";
    const inset = slides[0]?.offsetLeft || 0;
    track.style.transform = `translateX(${inset - index * step}px)`;
    if (!withTransition) {
      track.offsetHeight;
      track.style.transition = "";
    }
  }

  function measure() {
    step = slides[1].offsetLeft - slides[0].offsetLeft || slides[0].offsetWidth;
  }

  function buildDots() {
    if (!dotsWrap) return;
    dotsWrap.innerHTML = "";
    dots = [];
    originalSlides.forEach((_, i) => {
      const button = document.createElement("button");
      button.className = "carousel-dot";
      button.type = "button";
      button.setAttribute("aria-label", `Go to offers set ${i + 1}`);
      button.addEventListener("click", () => goTo(loopStart + i, true));
      dotsWrap.appendChild(button);
      dots.push(button);
    });
  }

  function update() {
    setTrackPosition();
    const active = normalizedIndex();
    dots.forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex === active));
  }

  function goTo(target, userAction = false) {
    index = target;
    update();
    if (userAction) restart();
  }

  function normalizeLoopPosition() {
    if (index >= loopStart + originalSlides.length) {
      index -= originalSlides.length;
      setTrackPosition(false);
    } else if (index < loopStart) {
      index += originalSlides.length;
      setTrackPosition(false);
    }
    const active = normalizedIndex();
    dots.forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex === active));
  }

  function start() {
    if (prefersReducedMotion) return;
    timer = window.setInterval(() => goTo(index + 1), 3600);
  }

  function stop() {
    window.clearInterval(timer);
  }

  function restart() {
    stop();
    start();
  }

  function rebuild() {
    measure();
    buildDots();
    setTrackPosition(false);
    const active = normalizedIndex();
    dots.forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex === active));
  }

  prev?.addEventListener("click", () => goTo(index - 1, true));
  next?.addEventListener("click", () => goTo(index + 1, true));
  track.addEventListener("transitionend", normalizeLoopPosition);
  carousel.addEventListener("mouseenter", stop);
  carousel.addEventListener("mouseleave", start);
  carousel.addEventListener("focusin", stop);
  carousel.addEventListener("focusout", start);

  let resizeTimer;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(rebuild, 150);
  });

  rebuild();
  start();
}

function initReviewsModal() {
  const modal = document.querySelector("[data-review-modal]");
  const openButton = document.querySelector("[data-review-modal-open]");
  const closeButtons = document.querySelectorAll("[data-review-modal-close]");
  if (!modal || !openButton) return;

  function openModal() {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("reviews-modal-open");
    modal.querySelector(".review-modal-close")?.focus();
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("reviews-modal-open");
    openButton.focus();
  }

  openButton.addEventListener("click", openModal);
  closeButtons.forEach((button) => button.addEventListener("click", closeModal));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[character]));
}

function renderReviewCard(review) {
  const rating = Math.max(1, Math.min(5, Number(review.rating) || 5));
  const stars = "★".repeat(rating);
  const source = [review.treatment, review.source].filter(Boolean).join(" · ");

  return `
    <figure class="review-card">
      <p class="stars" aria-label="${rating} star client review">${stars}</p>
      <blockquote><p>${escapeHtml(review.text)}</p></blockquote>
      <cite>
        <span class="review-avatar" aria-hidden="true">${escapeHtml(review.initial || review.name?.[0] || "L")}</span>
        <span class="review-byline">${escapeHtml(review.name || "Client")}<span>${escapeHtml(source || "Verified client")}</span></span>
      </cite>
    </figure>
  `;
}

async function initReviewsFeed() {
  const grid = document.querySelector("[data-reviews-grid]");
  if (!grid || !grid.dataset.reviewsSource) return;

  try {
    const response = await fetch(grid.dataset.reviewsSource, { cache: "no-cache" });
    if (!response.ok) return;

    const data = await response.json();
    if (!Array.isArray(data.reviews) || !data.reviews.length) return;

    grid.innerHTML = data.reviews.map(renderReviewCard).join("");

    const summary = document.querySelector("[data-reviews-summary]");
    if (summary && data.summary) {
      const rating = escapeHtml(data.summary.rating || "5.0");
      const count = Number(data.summary.count) || data.reviews.length;
      summary.setAttribute("aria-label", `Rated ${rating} out of 5 from ${count} client reviews`);
      summary.innerHTML = `
        <strong>${rating}</strong>
        <span aria-hidden="true">★★★★★</span>
        <small>${count} client reviews</small>
      `;
    }
  } catch (error) {
    // Static HTML reviews remain visible if JSON cannot load, such as from file://.
  }
}

initReviewsFeed().finally(() => {
  initGsapMotion();
  initCarousels();
  initOffersCarousel();
  initPriceAccordions();
  initReviewsModal();
});

document.querySelectorAll("[data-nav-link]").forEach((link) => {
  const href = link.getAttribute("href") || "";
  const target = href.split("/").pop() || "index.html";
  if (target === currentPath) {
    link.classList.add("active");
    link.setAttribute("aria-current", "page");
  }
});

/* ===================== Cookie consent banner (GDPR/PECR) ===================== */
(function initCookieConsent() {
  var KEY = "ld-cookie-consent";
  function apply(choice) { window.ldConsent = choice; }
  try {
    var saved = localStorage.getItem(KEY);
    if (saved) { apply(saved); return; }
  } catch (e) { /* storage unavailable — still show the notice */ }

  var cookiesHref = location.pathname.indexOf("/pages/") > -1 ? "cookies.html" : "pages/cookies.html";
  var banner = document.createElement("div");
  banner.className = "cookie-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Cookie notice");
  banner.innerHTML =
    '<div class="cookie-banner-inner">' +
      '<p class="cookie-banner-text">We use essential cookies to run the site and online booking, and privacy-friendly analytics to improve it. ' +
        'Read our <a href="' + cookiesHref + '">Cookie Policy</a>.</p>' +
      '<div class="cookie-banner-actions">' +
        '<button type="button" class="btn btn-secondary" data-consent="essential">Essential only</button>' +
        '<button type="button" class="btn btn-primary" data-consent="all">Accept all</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(banner);
  requestAnimationFrame(function () { banner.classList.add("is-visible"); });

  banner.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-consent]");
    if (!btn) return;
    var choice = btn.getAttribute("data-consent");
    try { localStorage.setItem(KEY, choice); } catch (e) {}
    apply(choice);
    banner.classList.remove("is-visible");
    setTimeout(function () { banner.remove(); }, 320);
  });
})();
