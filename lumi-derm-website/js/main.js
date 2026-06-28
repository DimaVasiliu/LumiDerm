const header = document.querySelector('[data-header]');
const navToggle = document.querySelector('[data-nav-toggle]');
const navMenu = document.querySelector('[data-nav-menu]');
const faqButtons = document.querySelectorAll('[data-faq-button]');
const revealItems = document.querySelectorAll('[data-reveal]');
const filterButtons = document.querySelectorAll('[data-filter]');
const treatmentCards = document.querySelectorAll('[data-treatment-category]');
const currentPath = window.location.pathname.split('/').pop() || 'index.html';
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const focusableSelector =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function setFocusableState(container, enabled) {
  container
    .querySelectorAll('a, button, input, select, textarea, [tabindex]')
    .forEach((element) => {
      if (enabled) {
        if (element.dataset.previousTabindex !== undefined) {
          const previous = element.dataset.previousTabindex;
          if (previous) element.setAttribute('tabindex', previous);
          else element.removeAttribute('tabindex');
          delete element.dataset.previousTabindex;
        }
        return;
      }
      if (element.dataset.previousTabindex === undefined) {
        element.dataset.previousTabindex = element.getAttribute('tabindex') || '';
      }
      element.setAttribute('tabindex', '-1');
    });
}

function trapFocus(event, container) {
  if (event.key !== 'Tab') return;
  const focusable = Array.from(container.querySelectorAll(focusableSelector)).filter(
    (element) => !element.closest('[inert]'),
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setHeaderState() {
  if (!header) return;
  header.classList.toggle('is-scrolled', window.scrollY > 18);
}

setHeaderState();
window.addEventListener('scroll', setHeaderState, { passive: true });

if (navToggle && navMenu) {
  function syncNavigationState() {
    if (window.innerWidth >= 980) navMenu.removeAttribute('aria-hidden');
    else if (!navMenu.classList.contains('is-open')) navMenu.setAttribute('aria-hidden', 'true');
  }

  syncNavigationState();

  function closeMobileMenu() {
    navToggle.setAttribute('aria-expanded', 'false');
    navMenu.setAttribute('aria-hidden', 'true');
    navMenu.classList.remove('is-open');
    navMenu.style.zIndex = '';
    header?.classList.remove('menu-active');
    document.body.classList.remove('menu-open');
  }

  navToggle.addEventListener('click', () => {
    const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!isOpen));
    navMenu.setAttribute('aria-hidden', String(isOpen));
    navMenu.classList.toggle('is-open', !isOpen);
    navMenu.style.zIndex = !isOpen ? '10010' : '';
    header?.classList.toggle('menu-active', !isOpen);
    document.body.classList.toggle('menu-open', !isOpen);
  });

  navMenu.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLAnchorElement)) return;
    closeMobileMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeMobileMenu();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 980) closeMobileMenu();
    syncNavigationState();
  });
}

document.querySelectorAll("a[href^='#']").forEach((link) => {
  link.addEventListener('click', (event) => {
    const href = link.getAttribute('href');
    if (!href || href === '#') return;
    const target = document.querySelector(href);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    if (link.classList.contains('skip-link') && target instanceof HTMLElement) {
      target.focus({ preventScroll: true });
    }
  });
});

faqButtons.forEach((button) => {
  const answer = document.getElementById(button.getAttribute('aria-controls'));
  button.addEventListener('click', () => {
    const isExpanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!isExpanded));
    if (answer) {
      answer.style.maxHeight = isExpanded ? '0px' : `${answer.scrollHeight}px`;
    }
  });
});

function initPriceAccordions() {
  const priceButtons = document.querySelectorAll('[data-price-toggle]');
  const priceFilters = document.querySelectorAll('[data-price-filter]');
  const priceCards = document.querySelectorAll('[data-price-group]');
  if (!priceButtons.length) return;

  function setPanel(button, expanded) {
    const card = button.closest('.price-accordion');
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    if (!panel) return;
    button.setAttribute('aria-expanded', String(expanded));
    card?.classList.toggle('is-open', expanded);
    panel.style.maxHeight = expanded ? `${panel.scrollHeight}px` : '0px';
  }

  function applyPriceFilter(filter = 'popular') {
    priceFilters.forEach((button) => {
      const isActive = button.dataset.priceFilter === filter;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    priceCards.forEach((card) => {
      const groups = (card.dataset.priceGroup || '').split(' ');
      const isVisible = filter === 'all' || groups.includes(filter);
      card.classList.toggle('is-hidden', !isVisible);

      if (!isVisible) {
        const button = card.querySelector('[data-price-toggle]');
        if (button) setPanel(button, false);
      }
    });
  }

  priceButtons.forEach((button) => {
    setPanel(button, button.getAttribute('aria-expanded') === 'true');
    button.addEventListener('click', () => {
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      setPanel(button, !isExpanded);
    });
  });

  priceFilters.forEach((button) => {
    button.addEventListener('click', () => {
      applyPriceFilter(button.dataset.priceFilter || 'popular');
    });
  });

  applyPriceFilter('popular');

  window.addEventListener('resize', () => {
    priceButtons.forEach((button) => {
      if (button.getAttribute('aria-expanded') === 'true') {
        setPanel(button, true);
      }
    });
  });
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter || 'all';
    filterButtons.forEach((item) => item.classList.toggle('is-active', item === button));
    treatmentCards.forEach((card) => {
      const categories = (card.dataset.treatmentCategory || '').split(' ');
      card.classList.toggle('is-hidden', filter !== 'all' && !categories.includes(filter));
    });
  });
});

function initFallbackReveals() {
  if (!('IntersectionObserver' in window)) {
    revealItems.forEach((item) => item.classList.add('is-visible'));
    return;
  }

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.16, rootMargin: '0px 0px -42px 0px' },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}

function initMotion() {
  initFallbackReveals();
}

function initCarousels() {
  document.querySelectorAll('[data-carousel]').forEach((carousel) => {
    const track = carousel.querySelector('.carousel-track');
    const slides = Array.from(carousel.querySelectorAll('.carousel-slide, .offer-slide'));
    const prev = carousel.querySelector('[data-carousel-prev]');
    const next = carousel.querySelector('[data-carousel-next]');
    const dotsWrap = carousel.querySelector('[data-carousel-dots]');
    if (!track || slides.length < 2 || !dotsWrap) return;

    carousel.setAttribute('role', 'region');
    carousel.setAttribute('aria-roledescription', 'carousel');
    carousel.setAttribute('tabindex', '0');
    const status = document.createElement('p');
    status.className = 'sr-only';
    status.setAttribute('aria-live', 'polite');
    carousel.appendChild(status);

    let index = 0;
    let timer;
    const dots = slides.map((_, dotIndex) => {
      const button = document.createElement('button');
      button.className = 'carousel-dot';
      button.type = 'button';
      button.setAttribute('aria-label', `Go to item ${dotIndex + 1} of ${slides.length}`);
      button.addEventListener('click', () => goTo(dotIndex, true));
      dotsWrap.appendChild(button);
      return button;
    });

    function update(announce = false) {
      track.style.transform = `translateX(-${index * 100}%)`;
      slides.forEach((slide, slideIndex) => {
        const active = slideIndex === index;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', String(!active));
        setFocusableState(slide, active);
      });
      dots.forEach((dot, dotIndex) => {
        const active = dotIndex === index;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-current', active ? 'true' : 'false');
      });
      if (announce) status.textContent = `Item ${index + 1} of ${slides.length}`;
    }

    function goTo(nextIndex, userAction = false) {
      index = (nextIndex + slides.length) % slides.length;
      update(userAction);
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

    prev?.addEventListener('click', () => goTo(index - 1, true));
    next?.addEventListener('click', () => goTo(index + 1, true));
    carousel.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(index - 1, true);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goTo(index + 1, true);
      }
    });
    carousel.addEventListener('mouseenter', stop);
    carousel.addEventListener('mouseleave', start);
    carousel.addEventListener('focusin', stop);
    carousel.addEventListener('focusout', start);
    update();
    start();
  });
}

function initOffersCarousel() {
  const carousel = document.querySelector('[data-offers-carousel]');
  if (!carousel) return;
  const track = carousel.querySelector('[data-offers-track]');
  const originalSlides = Array.from(carousel.querySelectorAll('.offer-slide'));
  const prev = document.querySelector('[data-offers-prev]');
  const next = document.querySelector('[data-offers-next]');
  const dotsWrap = document.querySelector('[data-offers-dots]');
  if (!track || originalSlides.length < 2) return;

  carousel.setAttribute('role', 'region');
  carousel.setAttribute('aria-roledescription', 'carousel');
  carousel.setAttribute('aria-label', 'Treatments and offers');
  carousel.setAttribute('tabindex', '0');
  const status = document.createElement('p');
  status.className = 'sr-only';
  status.setAttribute('aria-live', 'polite');
  carousel.appendChild(status);
  const pauseButton = document.createElement('button');
  pauseButton.className = 'carousel-pause';
  pauseButton.type = 'button';
  pauseButton.textContent = 'Pause rotation';
  dotsWrap?.insertAdjacentElement('afterend', pauseButton);

  originalSlides.forEach((slide, slideIndex) => {
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', `${slideIndex + 1} of ${originalSlides.length}`);
  });

  originalSlides.forEach((slide) => {
    const beforeClone = slide.cloneNode(true);
    const afterClone = slide.cloneNode(true);
    beforeClone.classList.add('is-clone');
    afterClone.classList.add('is-clone');
    beforeClone.setAttribute('aria-hidden', 'true');
    afterClone.setAttribute('aria-hidden', 'true');
    beforeClone.inert = true;
    afterClone.inert = true;
    setFocusableState(beforeClone, false);
    setFocusableState(afterClone, false);
    track.insertBefore(beforeClone, track.firstChild);
    track.appendChild(afterClone);
  });

  const slides = Array.from(track.querySelectorAll('.offer-slide'));
  const loopStart = originalSlides.length;

  let index = loopStart;
  let step = 0;
  let timer;
  let dots = [];
  let paused = prefersReducedMotion;
  let touchStartX = null;
  pauseButton.textContent = paused ? 'Resume rotation' : 'Pause rotation';

  function normalizedIndex() {
    return (
      (((index - loopStart) % originalSlides.length) + originalSlides.length) %
      originalSlides.length
    );
  }

  function setTrackPosition(withTransition = true) {
    track.style.transition = withTransition ? '' : 'none';
    const inset = slides[0]?.offsetLeft || 0;
    track.style.transform = `translateX(${inset - index * step}px)`;
    if (!withTransition) {
      track.offsetHeight;
      track.style.transition = '';
    }
  }

  function measure() {
    step = slides[1].offsetLeft - slides[0].offsetLeft || slides[0].offsetWidth;
  }

  function buildDots() {
    if (!dotsWrap) return;
    dotsWrap.innerHTML = '';
    dots = [];
    originalSlides.forEach((_, i) => {
      const button = document.createElement('button');
      button.className = 'carousel-dot';
      button.type = 'button';
      button.setAttribute('aria-label', `Go to offer ${i + 1} of ${originalSlides.length}`);
      button.addEventListener('click', () => goTo(loopStart + i, true));
      dotsWrap.appendChild(button);
      dots.push(button);
    });
  }

  function update(announce = false) {
    setTrackPosition();
    const active = normalizedIndex();
    originalSlides.forEach((slide, slideIndex) => {
      slide.classList.toggle('is-active', slideIndex === active);
      slide.setAttribute('aria-current', slideIndex === active ? 'true' : 'false');
    });
    dots.forEach((dot, dotIndex) => {
      const current = dotIndex === active;
      dot.classList.toggle('is-active', current);
      dot.setAttribute('aria-current', current ? 'true' : 'false');
    });
    if (announce) status.textContent = `Offer ${active + 1} of ${originalSlides.length}`;
  }

  function goTo(target, userAction = false) {
    index = target;
    update(userAction);
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
    dots.forEach((dot, dotIndex) => dot.classList.toggle('is-active', dotIndex === active));
  }

  function start() {
    if (paused) return;
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
    dots.forEach((dot, dotIndex) => dot.classList.toggle('is-active', dotIndex === active));
  }

  prev?.addEventListener('click', () => goTo(index - 1, true));
  next?.addEventListener('click', () => goTo(index + 1, true));
  pauseButton.addEventListener('click', () => {
    paused = !paused;
    pauseButton.textContent = paused ? 'Resume rotation' : 'Pause rotation';
    pauseButton.setAttribute('aria-pressed', String(paused));
    if (paused) stop();
    else start();
  });
  pauseButton.setAttribute('aria-pressed', String(paused));
  track.addEventListener('transitionend', normalizeLoopPosition);
  carousel.addEventListener('mouseenter', stop);
  carousel.addEventListener('mouseleave', start);
  carousel.addEventListener('focusin', stop);
  carousel.addEventListener('focusout', start);
  carousel.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(index - 1, true);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(index + 1, true);
    }
  });
  carousel.addEventListener(
    'touchstart',
    (event) => {
      touchStartX = event.changedTouches[0]?.clientX ?? null;
      stop();
    },
    { passive: true },
  );
  carousel.addEventListener(
    'touchend',
    (event) => {
      if (touchStartX === null) return;
      const distance = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
      if (Math.abs(distance) > 45) goTo(index + (distance < 0 ? 1 : -1), true);
      touchStartX = null;
      start();
    },
    { passive: true },
  );

  let resizeTimer;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(rebuild, 150);
  });

  rebuild();
  start();
}

function initReviewsModal() {
  const modal = document.querySelector('[data-review-modal]');
  const openButton = document.querySelector('[data-review-modal-open]');
  const closeButtons = document.querySelectorAll('[data-review-modal-close]');
  if (!modal || !openButton) return;
  let returnFocus = openButton;
  modal.inert = true;

  function openModal() {
    returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : openButton;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    modal.inert = false;
    document.body.classList.add('reviews-modal-open');
    window.setTimeout(
      () => modal.querySelector('.review-modal-close')?.focus(),
      prefersReducedMotion ? 0 : 240,
    );
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    modal.inert = true;
    document.body.classList.remove('reviews-modal-open');
    returnFocus.focus();
  }

  openButton.addEventListener('click', openModal);
  closeButtons.forEach((button) => button.addEventListener('click', closeModal));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    } else if (modal.classList.contains('is-open')) {
      trapFocus(event, modal);
    }
  });
}

function initPriceModals() {
  const radios = Array.from(document.querySelectorAll("input[name='pricemodal']"));
  const closeRadio = document.getElementById('t-none');
  if (!radios.length || !closeRadio) return;
  let activeModal = null;
  let returnFocus = null;

  document.querySelectorAll('label[for]').forEach((label) => {
    const target = document.getElementById(label.htmlFor);
    if (!target || target.name !== 'pricemodal') return;
    if (!label.classList.contains('price-modal-backdrop')) {
      if (!label.hasAttribute('tabindex')) label.setAttribute('tabindex', '0');
      if (!label.hasAttribute('role')) label.setAttribute('role', 'button');
    }
    label.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      label.click();
    });
  });

  function syncModals() {
    const selected = radios.find(
      (radio) => radio.checked && radio.classList.contains('price-modal-open'),
    );
    document.querySelectorAll('.price-modal').forEach((modal) => {
      const open = selected?.nextElementSibling === modal;
      modal.setAttribute('aria-hidden', String(!open));
      modal.inert = !open;
      if (open) activeModal = modal;
    });

    if (selected && activeModal) {
      returnFocus = document.querySelector(`label[for='${selected.id}']`);
      document.body.classList.add('price-modal-active');
      requestAnimationFrame(() => activeModal?.querySelector('.price-modal-close')?.focus());
    } else {
      document.body.classList.remove('price-modal-active');
      activeModal = null;
      if (returnFocus instanceof HTMLElement) returnFocus.focus();
      returnFocus = null;
    }
  }

  radios.forEach((radio) => radio.addEventListener('change', syncModals));
  document.addEventListener('keydown', (event) => {
    if (!activeModal) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeRadio.checked = true;
      closeRadio.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      trapFocus(event, activeModal);
    }
  });
  syncModals();
}

function escapeHtml(value = '') {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );
}

function renderReviewCard(review) {
  const rating = Math.max(1, Math.min(5, Number(review.rating) || 5));
  const stars = '★'.repeat(rating);
  const source = [review.treatment, review.source].filter(Boolean).join(' · ');

  return `
    <figure class="review-card">
      <p class="stars" aria-label="${rating} star client review">${stars}</p>
      <blockquote><p>${escapeHtml(review.text)}</p></blockquote>
      <cite>
        <span class="review-avatar" aria-hidden="true">${escapeHtml(
          review.initial || review.name?.[0] || 'L',
        )}</span>
        <span class="review-byline">${escapeHtml(review.name || 'Client')}<span>${escapeHtml(
          source || 'Client feedback',
        )}</span></span>
      </cite>
    </figure>
  `;
}

async function initReviewsFeed() {
  const grid = document.querySelector('[data-reviews-grid]');
  if (!grid || !grid.dataset.reviewsSource) return;

  try {
    const response = await fetch(grid.dataset.reviewsSource, { cache: 'no-cache' });
    if (!response.ok) return;

    const data = await response.json();
    if (!Array.isArray(data.reviews) || !data.reviews.length) return;

    grid.innerHTML = data.reviews.map(renderReviewCard).join('');

    const summary = document.querySelector('[data-reviews-summary]');
    if (summary) {
      const count = data.reviews.length;
      const total = data.reviews.reduce(
        (sum, review) => sum + Math.max(1, Math.min(5, Number(review.rating) || 5)),
        0,
      );
      const rating = (total / count).toFixed(1);
      summary.setAttribute(
        'aria-label',
        `Rated ${rating} out of 5 from ${count} reviews in this feed`,
      );
      summary.innerHTML = `
        <strong>${rating}</strong>
        <span aria-hidden="true">★★★★★</span>
        <small>${count} reviews in this feed</small>
      `;
    }
  } catch {
    // Static HTML reviews remain visible if JSON cannot load, such as from file://.
  }
}

initReviewsFeed().finally(() => {
  initMotion();
  initCarousels();
  initOffersCarousel();
  initPriceAccordions();
  initPriceModals();
  initReviewsModal();
});

document.querySelectorAll('[data-nav-link]').forEach((link) => {
  const href = link.getAttribute('href') || '';
  const target = href.split('/').pop() || 'index.html';
  if (target === currentPath) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
});

/* ===================== Cookie consent banner (GDPR/PECR) ===================== */
(function initCookieConsent() {
  const KEY = 'ld-cookie-consent-v2';
  const VERSION = 2;
  const embedPlaceholders = new WeakMap();
  let banner = null;

  document.querySelectorAll('[data-consent-embed]').forEach((container) => {
    embedPlaceholders.set(container, container.innerHTML);
  });

  function readConsent() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved?.version === VERSION && typeof saved.categories?.externalMedia === 'boolean') {
        return saved;
      }
    } catch {
      // Invalid or unavailable storage is handled by showing the choices again.
    }
    return null;
  }

  function loadEmbed(container) {
    if (!container || container.dataset.loaded === 'true') return;
    const source = container.dataset.src;
    const provider = container.dataset.provider;
    if (!source || !provider) return;

    const iframe = document.createElement('iframe');
    iframe.src = source;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.title = container.dataset.title || `Embedded content from ${provider}`;
    iframe.className = provider === 'square' ? 'booking-frame' : 'consent-embed-frame';
    container.replaceChildren(iframe);
    container.dataset.loaded = 'true';
    container.classList.add('is-loaded');
  }

  function unloadEmbed(container) {
    const placeholder = embedPlaceholders.get(container);
    if (!container || placeholder === undefined || container.dataset.loaded !== 'true') return;
    container.innerHTML = placeholder;
    container.dataset.loaded = 'false';
    container.classList.remove('is-loaded');
  }

  function applyConsent(record) {
    window.ldConsent = record;
    if (record.categories.externalMedia) {
      document.querySelectorAll('[data-consent-embed]').forEach(loadEmbed);
    } else {
      document.querySelectorAll('[data-consent-embed]').forEach(unloadEmbed);
    }
    window.dispatchEvent(new CustomEvent('lumiderm:consentchange', { detail: record }));
  }

  function saveConsent(externalMedia) {
    const record = {
      version: VERSION,
      timestamp: new Date().toISOString(),
      categories: { essential: true, externalMedia },
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(record));
    } catch {
      // The in-memory decision still applies for this page view.
    }
    applyConsent(record);
    closeBanner();
  }

  function closeBanner() {
    if (!banner) return;
    banner.classList.remove('is-visible');
    const closingBanner = banner;
    closingBanner.setAttribute('aria-hidden', 'true');
    closingBanner.inert = true;
    banner = null;
    window.setTimeout(() => closingBanner.remove(), prefersReducedMotion ? 0 : 320);
  }

  function showBanner({ focus = false } = {}) {
    if (banner) {
      if (focus) banner.querySelector('button')?.focus();
      return;
    }
    const cookiesHref = location.pathname.includes('/pages/')
      ? 'cookies.html'
      : 'pages/cookies.html';
    banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie and external media settings');
    banner.innerHTML = `
      <div class="cookie-banner-inner">
        <p class="cookie-banner-text">Essential storage keeps your choice. Optional external media loads Square booking and Google Maps only when you allow it or select a one-time load button. Square may show its own cookie choices after loading. Read our <a href="${cookiesHref}">Cookie Policy</a>.</p>
        <div class="cookie-banner-actions">
          <button type="button" class="btn btn-secondary" data-consent="essential">Essential only</button>
          <button type="button" class="btn btn-primary" data-consent="external-media">Allow external media</button>
        </div>
      </div>`;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner?.classList.add('is-visible'));
    if (focus) requestAnimationFrame(() => banner?.querySelector('button')?.focus());
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const loadButton = event.target.closest('[data-load-consent-embed]');
    if (loadButton) {
      loadEmbed(loadButton.closest('[data-consent-embed]'));
      return;
    }
    if (event.target.closest('[data-cookie-settings]')) {
      showBanner({ focus: true });
      return;
    }
    const consentButton = event.target.closest('[data-consent]');
    if (!consentButton || !banner?.contains(consentButton)) return;
    saveConsent(consentButton.dataset.consent === 'external-media');
  });

  const saved = readConsent();
  if (saved) applyConsent(saved);
  else showBanner();
})();
