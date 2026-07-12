const header = document.querySelector('[data-header]');
const navToggle = document.querySelector('[data-nav-toggle]');
const navMenu = document.querySelector('[data-nav-menu]');
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

// Hero background video: plays via the inline <source> + autoplay attribute (CSP-safe).
// Honour reduced-motion by pausing to the poster frame; otherwise make sure it plays.
(function initHeroVideo() {
  const video = document.querySelector('[data-hero-video]');
  if (!video) return;
  if (prefersReducedMotion) {
    video.removeAttribute('autoplay');
    video.pause();
    return;
  }
  const play = () => {
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  };
  if (video.readyState >= 2) play();
  else video.addEventListener('loadeddata', play, { once: true });
})();

// FAQ — minimal question list; each answer opens in a modal
(function initFaqModal() {
  const modal = document.querySelector('[data-faq-modal]');
  const openers = document.querySelectorAll('[data-faq-open]');
  if (!modal || !openers.length) return;

  const titleEl = modal.querySelector('#faq-modal-title');
  const bodyEl = modal.querySelector('[data-faq-modal-body]');
  const closeEls = modal.querySelectorAll('[data-faq-modal-close]');
  let lastFocus = null;

  function openModal(button) {
    const row = button.closest('.faq-row');
    const source = row && row.querySelector('.faq-a-source');
    const label = button.querySelector('.faq-q-text');
    if (titleEl) titleEl.textContent = label ? label.textContent : '';
    if (bodyEl) bodyEl.innerHTML = source ? source.innerHTML : '';

    lastFocus = document.activeElement;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('faq-modal-active');
    requestAnimationFrame(() => modal.querySelector('.faq-modal-close')?.focus());
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('faq-modal-active');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  openers.forEach((button) => button.addEventListener('click', () => openModal(button)));
  closeEls.forEach((el) => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  // Keep focus inside the modal while it is open.
  modal.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !modal.classList.contains('is-open')) return;
    const focusable = Array.from(modal.querySelectorAll(focusableSelector)).filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
})();

// "Chat with us" links open the floating chat assistant
document.querySelectorAll('[data-faq-chat]').forEach((button) => {
  button.addEventListener('click', () => {
    const launcher = document.querySelector('.lumi-chat-launcher');
    if (launcher instanceof HTMLElement) launcher.click();
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
      const feedCount = data.reviews.length;
      const total = data.reviews.reduce(
        (sum, review) => sum + Math.max(1, Math.min(5, Number(review.rating) || 5)),
        0,
      );
      const rating = data.summary?.rating || (total / feedCount).toFixed(1);
      const displayCount = data.summary?.count || feedCount;
      const label = data.summary?.label || 'reviews in this feed';
      summary.setAttribute(
        'aria-label',
        `Rated ${rating} out of 5 from ${displayCount} ${label}`,
      );
      summary.innerHTML = `
        <strong>${rating}</strong>
        <span aria-hidden="true">★★★★★</span>
        <small>${displayCount} ${escapeHtml(label)}</small>
      `;
    }
  } catch {
    // Static HTML reviews remain visible if JSON cannot load, such as from file://.
  }
}

/* ===================== Services: pinned horizontal scroll =====================
   Scrolling into the service preview pins the section; cards travel sideways mapped to scroll
   (rAF + light smoothing so a mouse wheel glides instead of jumping). The card in the
   centre gently zooms while the clinic backdrop reveals and drifts behind the track.
   Desktop only; reduced-motion / narrow screens keep the plain carousel. */
/* ===================== Treatment Index (data-driven from offers.json) =====================
   Offers are edited in the CMS (/cms/) which commits assets/data/offers.json to GitHub.
   Cloudflare redeploys and the homepage picks the changes up automatically. */
const OFFERS_SOURCE = 'assets/data/offers.json';

function tiEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function tiIsLive(offer) {
  if (!offer || !offer.title) return false;
  if (String(offer.status || 'live').toLowerCase() !== 'live') return false; // Drafts stay hidden
  if (!offer.expires) return true;
  const end = new Date(String(offer.expires) + 'T23:59:59');
  if (isNaN(end.getTime())) return true;
  return end.getTime() >= Date.now(); // expired offers drop off automatically
}

function tiWhenLabel(offer) {
  if (offer.expires) {
    const d = new Date(String(offer.expires) + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      return 'Ends ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  return offer.note || '';
}

function tiOfferHref(offer) {
  if (!offer.service) return 'pages/booking.html';
  const params = new URLSearchParams({
    service: offer.service,
    from: 'offer',
  });
  return 'pages/booking.html?' + params.toString();
}

function tiInjectSeo(offers) {
  const items = offers.map((offer, i) => {
    const priceMatch = String(offer.price || '').match(/[\d]+(?:\.[\d]+)?/);
    const node = {
      '@type': 'Offer',
      name: offer.title,
      description: offer.description || undefined,
      category: offer.category || undefined,
      url: 'https://lumidermaesthetics.com/' + tiOfferHref(offer),
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'BeautySalon', name: 'Lumi Derm Aesthetics' },
    };
    if (priceMatch) { node.price = priceMatch[0]; node.priceCurrency = 'GBP'; }
    if (offer.expires) node.validThrough = offer.expires;
    return { '@type': 'ListItem', position: i + 1, item: node };
  });
  const tag = document.createElement('script');
  tag.type = 'application/ld+json';
  tag.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: items });
  document.head.appendChild(tag);
}

async function initTreatmentIndex() {
  const root = document.querySelector('[data-tindex]');
  const list = root && root.querySelector('[data-tindex-list]');
  if (!root || !list) return;

  const layers = Array.from(root.querySelectorAll('[data-tindex-layer]'));
  const badgeEl = root.querySelector('[data-tindex-badge]');
  const priceEl = root.querySelector('[data-tindex-price]');
  const catEl = root.querySelector('[data-tindex-cat]');
  const capTitleEl = root.querySelector('[data-tindex-captitle]');
  const ctaEl = root.querySelector('[data-tindex-cta]');
  const progressEl = root.querySelector('[data-tindex-progress]');
  const emptyEl = document.querySelector('[data-tindex-empty]');

  let offers = [];
  try {
    const res = await fetch(OFFERS_SOURCE, { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      offers = Array.isArray(data) ? data : (Array.isArray(data.offers) ? data.offers : []);
    }
  } catch (err) { /* fall through to the empty state */ }

  // Only live, unexpired offers — featured first, original order otherwise.
  const live = offers.filter(tiIsLive);
  live.sort((a, b) => (b.featured === true ? 1 : 0) - (a.featured === true ? 1 : 0));

  if (!live.length) {
    root.hidden = true;
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  list.innerHTML = live.map((offer, i) => {
    const feat = offer.featured ? ' is-featured' : '';
    const img = tiEscape(offer.image || '');
    return (
      '<li class="tindex-row' + feat + '" data-tindex-row' +
      ' data-img="' + img + '" data-badge="' + tiEscape(offer.badge || '') + '"' +
      ' data-price="' + tiEscape(offer.price || '') + '"' +
      " style=\"--tindex-img: url('" + img + "')\">" +
        '<a class="tindex-link" href="' + tiEscape(tiOfferHref(offer)) + '">' +
          '<span class="tindex-num">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<span class="tindex-body">' +
            '<span class="tindex-cat">' + tiEscape(offer.category || '') +
              (offer.featured ? '<em class="tindex-star">Featured</em>' : '') +
            '</span>' +
            '<span class="tindex-title">' + tiEscape(offer.title) + '</span>' +
            '<span class="tindex-desc">' + tiEscape(offer.description || '') + '</span>' +
          '</span>' +
          '<span class="tindex-meta">' +
            '<span class="tindex-price">' + tiEscape(offer.price || '') + '</span>' +
            '<span class="tindex-when">' + tiEscape(tiWhenLabel(offer)) + '</span>' +
          '</span>' +
          '<span class="tindex-arrow" aria-hidden="true">&rarr;</span>' +
        '</a>' +
      '</li>'
    );
  }).join('');

  const rows = Array.from(list.querySelectorAll('[data-tindex-row]'));

  // Keep the active row within the scrollable list (used during auto-advance).
  function ensureRowVisible(row) {
    if (list.scrollHeight <= list.clientHeight + 2) return; // not scrollable
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    let delta = 0;
    if (rowRect.top < listRect.top + 4) delta = rowRect.top - listRect.top - 10;
    else if (rowRect.bottom > listRect.bottom - 4) delta = rowRect.bottom - listRect.bottom + 10;
    if (delta) list.scrollBy({ top: delta, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }

  // Preview panel: crossfade the image and sync the featured caption + CTA.
  let front = 0;
  let active = -1;
  let timer = null;
  function setActive(i) {
    if (i === active || !rows[i]) return;
    active = i;
    const row = rows[i];
    const offer = live[i] || {};
    rows.forEach((r, n) => r.classList.toggle('is-active', n === i));
    const src = row.dataset.img;
    const back = layers[1 - front];
    if (back) {
      if (src && back.getAttribute('src') !== src) back.setAttribute('src', src);
      back.classList.add('is-visible');
      if (layers[front]) layers[front].classList.remove('is-visible');
      front = 1 - front;
    }
    if (badgeEl) badgeEl.textContent = offer.badge || '';
    if (priceEl) priceEl.textContent = offer.price || '';
    if (catEl) catEl.textContent = offer.category || '';
    if (capTitleEl) capTitleEl.textContent = offer.title || '';
    if (ctaEl) {
      ctaEl.setAttribute('href', tiOfferHref(offer));
      ctaEl.setAttribute('aria-label', offer.title ? 'View offer: ' + offer.title : 'View offer');
    }
    if (timer) {
      restartProgress(); // only animate the bar while auto-playing
      ensureRowVisible(row); // keep the auto-highlighted row within the scroll box
    }
  }
  rows.forEach((row, i) => {
    row.addEventListener('mouseenter', () => setActive(i));
    row.addEventListener('focusin', () => setActive(i));
  });

  // Ambient auto-advance through the visible offers. The visitor takes over by
  // hovering/focusing the section; it never runs on touch or under reduced motion.
  const AUTO_INTERVAL = 3800;
  const canAuto =
    !prefersReducedMotion && window.matchMedia('(min-width: 901px) and (hover: hover)').matches;
  if (progressEl) progressEl.style.setProperty('--tindex-interval', AUTO_INTERVAL + 'ms');

  function visibleIndices() {
    return rows.map((_, i) => i).filter((i) => !rows[i].classList.contains('is-hidden-row'));
  }
  function restartProgress() {
    if (!progressEl || prefersReducedMotion) return;
    progressEl.classList.remove('is-running');
    void progressEl.offsetWidth; // reflow so the animation restarts
    progressEl.classList.add('is-running');
  }
  function play() {
    if (!canAuto || timer) return;
    const vis = visibleIndices();
    if (vis.length < 2) return;
    restartProgress();
    timer = window.setInterval(() => {
      const v = visibleIndices();
      const pos = v.indexOf(active);
      setActive(v[(pos + 1) % v.length]);
    }, AUTO_INTERVAL);
  }
  function pause() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
    if (progressEl) progressEl.classList.remove('is-running');
  }

  if (canAuto) {
    root.addEventListener('pointerenter', pause);
    root.addEventListener('pointerleave', play);
    root.addEventListener('focusin', pause);
    root.addEventListener('focusout', (event) => {
      if (!root.contains(event.relatedTarget)) play();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause();
      else play();
    });
  }

  setActive(0);
  play();

  // Size the scrollable list to the preview image so the two columns line up.
  // On mobile the list flows naturally (CSS clears the inline height).
  const frame = root.querySelector('.tindex-frame');
  function matchListHeight() {
    if (!frame) return;
    if (window.matchMedia('(min-width: 901px)').matches) {
      const h = Math.round(frame.getBoundingClientRect().height);
      if (h > 0) list.style.maxHeight = h + 'px';
    } else {
      list.style.maxHeight = '';
    }
  }
  matchListHeight();
  window.addEventListener('resize', matchListHeight, { passive: true });
  if (window.requestAnimationFrame) window.requestAnimationFrame(matchListHeight);

  tiInjectSeo(live);
}

// Contact: highlight today's opening hours and show a live open/closed status.
function initContactStatus() {
  const list = document.querySelector('[data-hours-list]');
  if (!list) return;
  const rows = Array.from(list.querySelectorAll('li[data-day]'));
  if (!rows.length) return;
  const statusEl = document.querySelector('[data-open-status]');
  const now = new Date();
  const today = now.getDay(); // 0 = Sunday … 6 = Saturday
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const toMin = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + m;
  };
  const byDay = {};
  rows.forEach((row) => {
    byDay[Number(row.dataset.day)] = row;
  });

  // Highlight today's row with a "Today" tag.
  const todayRow = byDay[today];
  if (todayRow) {
    todayRow.classList.add('is-today');
    const dayCell = todayRow.querySelector('.hours-day');
    if (dayCell && !dayCell.querySelector('.hours-today')) {
      const tag = document.createElement('em');
      tag.className = 'hours-today';
      tag.textContent = 'Today';
      dayCell.appendChild(tag);
    }
  }

  if (!statusEl) return;
  const textEl = statusEl.querySelector('.contact-status-text');
  let openNow = false;
  let closeAt = null;
  if (todayRow && todayRow.dataset.open && todayRow.dataset.close) {
    const openMin = toMin(todayRow.dataset.open);
    const closeMin = toMin(todayRow.dataset.close);
    if (nowMin >= openMin && nowMin < closeMin) {
      openNow = true;
      closeAt = todayRow.dataset.close;
    }
  }

  if (openNow) {
    statusEl.classList.add('is-open');
    if (textEl) textEl.textContent = 'Open now · until ' + closeAt;
  } else {
    statusEl.classList.add('is-closed');
    let label = 'Closed';
    if (todayRow && todayRow.dataset.open && nowMin < toMin(todayRow.dataset.open)) {
      label = 'Closed · opens ' + todayRow.dataset.open + ' today';
    } else {
      for (let i = 1; i <= 7; i += 1) {
        const nextRow = byDay[(today + i) % 7];
        if (nextRow && nextRow.dataset.open) {
          const when = i === 1 ? 'tomorrow' : dayNames[(today + i) % 7];
          label = 'Closed · opens ' + when + ' ' + nextRow.dataset.open;
          break;
        }
      }
    }
    if (textEl) textEl.textContent = label;
  }
  statusEl.hidden = false;
}

// Hero: auto-advancing treatment image showcase on the right of the hero.
function initHeroShowcase() {
  const root = document.querySelector('[data-hero-showcase]');
  if (!root) return;
  const slides = Array.from(root.querySelectorAll('.hero-showcase-slide'));
  const label = root.querySelector('[data-hero-label]');
  const dotsWrap = root.querySelector('[data-hero-dots]');
  if (slides.length < 2 || !dotsWrap) return;

  const dots = slides.map((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'hero-showcase-dot' + (i === 0 ? ' is-active' : '');
    dotsWrap.appendChild(dot);
    return dot;
  });

  let index = 0;
  function show(next) {
    if (next === index) return;
    slides[index].classList.remove('is-active');
    dots[index].classList.remove('is-active');
    index = next;
    slides[index].classList.add('is-active');
    dots[index].classList.add('is-active');
    if (label && slides[index].dataset.label) label.textContent = slides[index].dataset.label;
  }

  // Reduced motion: keep the first image static, no auto-advance.
  if (prefersReducedMotion) return;

  const advance = () => show((index + 1) % slides.length);
  let timer = window.setInterval(advance, 4200);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.clearInterval(timer);
      timer = null;
    } else if (!timer) {
      timer = window.setInterval(advance, 4200);
    }
  });
}

initReviewsFeed().finally(() => {
  initMotion();
  initCarousels();
  initTreatmentIndex();
  initPriceAccordions();
  initPriceModals();
  initReviewsModal();
  initHeroShowcase();
  initContactStatus();
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
  const KEY = 'ld-cookie-consent-v3';
  const VERSION = 3;
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
    const provider = container.dataset.provider;
    if (!provider) return;

    if (provider === 'treatwell') {
      const widgetUrl = container.dataset.widgetUrl;
      const scriptSource = container.dataset.widgetScript;
      const styleSource = container.dataset.widgetStyle;
      if (!widgetUrl || !scriptSource || !styleSource) return;

      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.type = 'text/css';
      stylesheet.media = 'screen';
      stylesheet.href = styleSource;
      stylesheet.dataset.treatwellWidgetAsset = 'true';

      const widget = document.createElement('div');
      widget.id = 'wahanda-online-booking-widget-iframe';
      widget.dataset.widgetUrl = widgetUrl;

      const script = document.createElement('script');
      script.src = scriptSource;
      script.async = true;
      script.dataset.treatwellWidgetAsset = 'true';

      document.head.appendChild(stylesheet);
      container.replaceChildren(widget);
      document.head.appendChild(script);
      container.dataset.loaded = 'true';
      container.classList.add('is-loaded');
      return;
    }

    const source = container.dataset.src;
    if (!source) return;

    const iframe = document.createElement('iframe');
    iframe.src = source;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.title = container.dataset.title || `Embedded content from ${provider}`;
    iframe.className = 'consent-embed-frame';
    container.replaceChildren(iframe);
    container.dataset.loaded = 'true';
    container.classList.add('is-loaded');
  }

  function unloadEmbed(container) {
    const placeholder = embedPlaceholders.get(container);
    if (!container || placeholder === undefined || container.dataset.loaded !== 'true') return;
    if (container.dataset.provider === 'treatwell') {
      document.querySelectorAll('[data-treatwell-widget-asset]').forEach((asset) => asset.remove());
    }
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
        <p class="cookie-banner-text">Essential storage keeps your choice. Optional external content loads the Treatwell booking widget and Google Maps only when you allow it or select a one-time load button. Treatwell and Google apply their own privacy and cookie choices. Read our <a href="${cookiesHref}">Cookie Policy</a>.</p>
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
