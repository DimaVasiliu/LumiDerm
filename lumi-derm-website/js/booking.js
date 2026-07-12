/* ==========================================================================
   Booking page
   --------------------------------------------------------------------------
   Lumi Derm currently books through Treatwell. This page keeps the client on a
   clear decision path, then loads the Treatwell widget on this page for live
   availability, payment and confirmation.
   ========================================================================== */
(function () {
  const SERVICES = [
    {
      slug: 'laser-hair-removal',
      group: 'laser',
      title: 'Laser hair removal',
      category: 'Cynosure Elite',
      summary: 'Long-term hair reduction for face and body areas using Cynosure Elite technology.',
      price: 'From £40',
      duration: 'Patch test required',
      image: '../assets/images/offer-laser-treatments-cynosure.webp',
      best: ['Face and body areas', 'Course planning', 'Lower-maintenance skin'],
      prep: ['Avoid tanning and self-tan', 'Shave the area 24 hours before', 'Book a patch test first'],
      aftercare: ['Avoid heat for 24-48 hours', 'Use SPF on exposed areas', 'Follow your aftercare notes'],
    },
    {
      slug: 'laser-rejuvenation',
      group: 'laser',
      title: 'Laser skin rejuvenation',
      category: 'Cynosure Elite',
      summary: 'A consultation-led skin refresh for tone, texture and visible skin quality.',
      price: 'From £100',
      duration: 'Consultation advised',
      image: '../assets/images/offer-microneedling.webp',
      best: ['Dullness', 'Texture support', 'Skin refresh plans'],
      prep: ['Avoid active exfoliants', 'Use SPF before your visit', 'Arrive with clean skin'],
      aftercare: ['Keep skin calm', 'Avoid heat and strong actives', 'Use daily SPF'],
    },
    {
      slug: 'vascular-treatment',
      group: 'laser',
      title: 'Laser vascular treatment',
      category: 'Cynosure Elite',
      summary: 'Targeted vascular laser treatment for suitable visible vessels after assessment.',
      price: 'From £45',
      duration: 'Consultation required',
      image: '../assets/images/offer-laser-treatments-cynosure.webp',
      best: ['Visible facial vessels', 'Targeted areas', 'Careful treatment planning'],
      prep: ['Avoid tanning', 'Pause strong actives as advised', 'Share medication details'],
      aftercare: ['Avoid heat and exercise', 'Protect the area from sun', 'Follow clinic guidance'],
    },
    {
      slug: 'electrolysis',
      group: 'laser',
      title: 'Electrolysis permanent hair removal',
      category: 'Apilus',
      summary: 'Precision permanent hair removal for smaller areas using Apilus electrolysis.',
      price: 'From £10',
      duration: 'Small-area sessions',
      image: '../assets/images/offer-electrolysis-apilus.webp',
      best: ['Small areas', 'Fine detail work', 'Permanent hair removal plans'],
      prep: ['Do not wax before treatment', 'Keep hair visible enough to treat', 'Avoid irritating products'],
      aftercare: ['Keep the area clean', 'Avoid touching or picking', 'Avoid heat for 24 hours'],
    },
    {
      slug: 'prp',
      group: 'injectables',
      title: 'PRP',
      category: 'Advanced skin',
      summary: 'Consultation-led PRP treatment planning for skin quality, regeneration and hair concerns.',
      price: 'From £240',
      duration: 'Course options',
      image: '../assets/images/offer-prp-treatment.webp',
      best: ['Skin support', 'Hair concerns', 'Regenerative treatment plans'],
      prep: ['Hydrate before your visit', 'Avoid alcohol beforehand', 'Discuss medication at consultation'],
      aftercare: ['Avoid makeup for 24 hours', 'Avoid heat and exercise', 'Use gentle skincare'],
    },
    {
      slug: 'profhilo',
      group: 'injectables',
      title: 'Profhilo',
      category: 'Skin boosters',
      summary: 'A hydration-focused skin booster plan for smoother, fresher-looking skin quality.',
      price: 'From £265',
      duration: 'Course recommended',
      image: '../assets/images/offer-skin-boosters.webp',
      best: ['Hydration support', 'Skin glow', 'Face and neck plans'],
      prep: ['Arrive makeup-free if possible', 'Avoid alcohol beforehand', 'Share any medical changes'],
      aftercare: ['Avoid touching injection points', 'Avoid heat for 24 hours', 'Follow aftercare advice'],
    },
    {
      slug: 'polynucleotides',
      group: 'injectables',
      title: 'Polynucleotides',
      category: 'Bio-remodelling',
      summary: 'A tailored injectable skin-support treatment for eyes, face or neck after consultation.',
      price: 'From £220',
      duration: 'Packages available',
      image: '../assets/images/offer-skin-boosters.webp',
      best: ['Eye-area support', 'Skin quality', 'Face and neck plans'],
      prep: ['Avoid alcohol beforehand', 'Arrive with clean skin', 'Discuss medical history'],
      aftercare: ['Expect mild marks or swelling', 'Avoid heat and makeup initially', 'Use SPF'],
    },
    {
      slug: 'lip-boosters',
      group: 'injectables',
      title: 'Lip boosters',
      category: 'Lip care',
      summary: 'Subtle hydration-focused lip booster treatment planning for a fresh natural look.',
      price: 'From £220',
      duration: 'Consultation led',
      image: '../assets/images/offer-lip-boosters.webp',
      best: ['Lip hydration', 'Natural finish', 'Soft rejuvenation'],
      prep: ['Avoid alcohol beforehand', 'Discuss cold sore history', 'Arrive with clean skin'],
      aftercare: ['Avoid heat and pressure', 'Do not massage unless advised', 'Follow clinic aftercare'],
    },
    {
      slug: 'mesotherapy',
      group: 'injectables',
      title: 'Mesotherapy',
      category: 'Skin infusion',
      summary: 'Micro-infusion treatment planning for hydration and visible skin freshness.',
      price: 'From £140',
      duration: 'Course options',
      image: '../assets/images/offer-mesotherapy.webp',
      best: ['Hydration', 'Skin glow', 'Dull or tired-looking skin'],
      prep: ['Avoid active exfoliants', 'Arrive with clean skin', 'Hydrate beforehand'],
      aftercare: ['Avoid makeup initially', 'Use gentle skincare', 'Use SPF daily'],
    },
    {
      slug: 'hair-loss',
      group: 'injectables',
      title: 'Hair loss treatment',
      category: 'Hair support',
      summary: 'Hair mesotherapy and PRP options for suitable scalp and hair-loss concerns.',
      price: 'From £130',
      duration: 'Consultation advised',
      image: '../assets/images/offer-hair-loss-treatment.webp',
      best: ['Hair mesotherapy', 'PRP for hair loss', 'Scalp treatment plans'],
      prep: ['Wash hair before appointment', 'Avoid heavy styling products', 'Discuss medication history'],
      aftercare: ['Avoid washing hair immediately', 'Avoid heat and exercise', 'Follow scalp aftercare'],
    },
    {
      slug: 'facials',
      group: 'facials',
      title: 'Facials & skin polish',
      category: 'Facials',
      summary: 'Bespoke facial treatments including deep cleanse, dermaplaning and Fire & Ice by iS Clinical.',
      price: 'From £70',
      duration: '45-90 minutes',
      image: '../assets/images/offer-facials.webp',
      best: ['Deep cleanse', 'Skin glow', 'Maintenance facials'],
      prep: ['Arrive with clean skin if possible', 'Pause strong actives if sensitive', 'Share skin concerns'],
      aftercare: ['Keep skincare gentle', 'Avoid harsh exfoliation', 'Use SPF'],
    },
    {
      slug: 'facial-peels',
      group: 'facials',
      title: 'Peels',
      category: 'Texture and clarity',
      summary: 'Peel menu including PRX-T33, glycolic, azelaic and salicylic options after assessment.',
      price: 'From £70',
      duration: 'Skin prep advised',
      image: '../assets/images/offer-peels.webp',
      best: ['Texture', 'Congestion', 'Skin brightness'],
      prep: ['Pause retinoids as advised', 'Avoid tanning', 'Use SPF before treatment'],
      aftercare: ['Avoid heat and exfoliation', 'Do not pick flaky skin', 'Use SPF daily'],
    },
    {
      slug: 'microneedling',
      group: 'facials',
      title: 'Microneedling',
      category: 'Skin renewal',
      summary: 'Collagen-focused skin renewal treatment for texture, tone and skin quality support.',
      price: 'From £130',
      duration: 'Course options',
      image: '../assets/images/offer-microneedling.webp',
      best: ['Texture support', 'Skin renewal', 'Collagen-focused plans'],
      prep: ['Pause strong actives', 'Avoid tanning', 'Arrive with clean skin'],
      aftercare: ['Avoid makeup initially', 'Avoid heat and sweating', 'Use gentle skincare and SPF'],
    },
    {
      slug: 'exosomes',
      group: 'facials',
      title: 'Exosomes',
      category: 'Skin science',
      summary: 'Advanced skin-support treatment option for a tailored rejuvenation plan.',
      price: 'From £150',
      duration: 'Consultation led',
      image: '../assets/images/offer-exosomes.webp',
      best: ['Skin quality', 'Advanced facial planning', 'Rejuvenation support'],
      prep: ['Arrive with clean skin', 'Avoid strong actives', 'Discuss skin history'],
      aftercare: ['Use gentle skincare', 'Avoid heat and exfoliation', 'Protect with SPF'],
    },
    {
      slug: 'endospheres',
      group: 'body',
      title: 'Endospheres therapy',
      category: 'Body therapy',
      summary: 'Body-focused lymphatic drainage, smoothing and contour support.',
      price: 'From £50',
      duration: 'Packages available',
      image: '../assets/images/offer-endospheres-therapy.webp',
      best: ['Body smoothing', 'Lymphatic drainage', 'Course plans'],
      prep: ['Hydrate well', 'Wear comfortable clothing', 'Avoid heavy meals before treatment'],
      aftercare: ['Drink water after treatment', 'Keep moving gently', 'Follow course guidance'],
    },
    {
      slug: 'lashes-brows',
      group: 'body',
      title: 'Lashes & brows',
      category: 'Finishing beauty',
      summary: 'Finishing beauty treatments for a polished, natural look.',
      price: 'From £25',
      duration: 'Patch test may apply',
      image: '../assets/images/offer-lashes-brows.webp',
      best: ['Natural definition', 'Low-maintenance finish', 'Lash and brow care'],
      prep: ['Arrive makeup-free around eyes', 'Book patch test if needed', 'Share sensitivity history'],
      aftercare: ['Avoid water initially if advised', 'Avoid rubbing the area', 'Follow product guidance'],
    },
  ];

  const cardsRoot = document.querySelector('[data-booking-cards]');
  const detail = document.querySelector('[data-booking-detail]');
  const filterButtons = Array.from(document.querySelectorAll('[data-booking-filter]'));
  const main = document.querySelector('.booking-redesign');
  const filterBar = document.querySelector('.booking-filter-bar');
  const pickerTitle = document.querySelector('#booking-picker-title');
  const pickerCopy = document.querySelector('[data-booking-picker-copy]');
  const changeButton = document.querySelector('[data-booking-change]');

  if (!cardsRoot || !detail) return;

  const fields = {
    image: detail.querySelector('[data-detail-image]'),
    category: detail.querySelector('[data-detail-category]'),
    title: detail.querySelector('[data-detail-title]'),
    summary: detail.querySelector('[data-detail-summary]'),
    price: detail.querySelector('[data-detail-price]'),
    duration: detail.querySelector('[data-detail-duration]'),
    best: detail.querySelector('[data-detail-best]'),
    prep: detail.querySelector('[data-detail-prep]'),
    aftercare: detail.querySelector('[data-detail-aftercare]'),
    bookButton: detail.querySelector('[data-detail-book-button]'),
    serviceLink: detail.querySelector('[data-detail-service-link]'),
  };

  const params = new URLSearchParams(window.location.search);
  const initialSlug = params.get('service');
  const initialService = SERVICES.find((service) => service.slug === initialSlug);
  let activeService = initialService || SERVICES[0];
  let activeFilter = 'all';
  let focusedBooking = Boolean(initialService);

  function setFocusedBooking(enabled) {
    focusedBooking = enabled;
    main?.classList.toggle('is-focused-booking', enabled);

    if (filterBar) filterBar.hidden = enabled;
    if (cardsRoot) cardsRoot.hidden = enabled;
    if (changeButton) changeButton.hidden = !enabled;

    if (pickerTitle) {
      pickerTitle.textContent = enabled ? 'Ready to book' : 'Choose a treatment';
    }

    if (pickerCopy) {
      pickerCopy.textContent = enabled
        ? 'The selected treatment details are open below, followed by the Treatwell calendar.'
        : 'Select a category, then tap a treatment card.';
    }
  }

  function listItems(items) {
    return items.map((item) => `<li>${item}</li>`).join('');
  }

  function updateDetail(service, options = {}) {
    activeService = service;

    if (fields.image) {
      fields.image.src = service.image;
      fields.image.alt = `${service.title} at Lumi Derm Aesthetics`;
    }
    if (fields.category) fields.category.textContent = service.category;
    if (fields.title) fields.title.textContent = service.title;
    if (fields.summary) fields.summary.textContent = service.summary;
    if (fields.price) fields.price.textContent = service.price;
    if (fields.duration) fields.duration.textContent = service.duration;
    if (fields.best) fields.best.innerHTML = listItems(service.best);
    if (fields.prep) fields.prep.innerHTML = listItems(service.prep);
    if (fields.aftercare) fields.aftercare.innerHTML = listItems(service.aftercare);
    if (fields.bookButton) fields.bookButton.textContent = 'Book in calendar';
    if (fields.serviceLink) fields.serviceLink.href = `services.html#${service.slug}`;

    cardsRoot.querySelectorAll('[data-service-card]').forEach((card) => {
      const isActive = card.dataset.serviceCard === service.slug;
      card.classList.toggle('is-active', isActive);
      card.setAttribute('aria-pressed', String(isActive));
    });

    const url = new URL(window.location.href);
    url.searchParams.set('service', service.slug);
    window.history.replaceState({}, '', url);

    if (options.scroll) {
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderCards() {
    if (focusedBooking) {
      cardsRoot.innerHTML = '';
      return;
    }

    const visibleServices = activeFilter === 'all'
      ? SERVICES
      : SERVICES.filter((service) => service.group === activeFilter);

    cardsRoot.innerHTML = visibleServices.map((service) => `
      <button class="booking-choice-card" type="button" data-service-card="${service.slug}" aria-pressed="${service.slug === activeService.slug}">
        <span class="booking-choice-thumb">
          <img src="${service.image}" alt="" loading="lazy">
        </span>
        <span class="booking-choice-copy">
          <span class="booking-choice-category">${service.category}</span>
          <strong>${service.title}</strong>
          <span>${service.summary}</span>
        </span>
        <span class="booking-choice-foot">
          <span>${service.price}</span>
          <span>View notes</span>
        </span>
      </button>
    `).join('');

    cardsRoot.querySelectorAll('[data-service-card]').forEach((card) => {
      card.addEventListener('click', () => {
        const selected = SERVICES.find((service) => service.slug === card.dataset.serviceCard);
        if (selected) updateDetail(selected, { scroll: true });
      });
    });
  }

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setFocusedBooking(false);
      activeFilter = button.dataset.bookingFilter || 'all';
      filterButtons.forEach((filterButton) => {
        filterButton.classList.toggle('is-active', filterButton === button);
      });
      renderCards();

      const visibleActive = activeFilter === 'all' || activeService.group === activeFilter;
      if (!visibleActive) {
        const firstInGroup = SERVICES.find((service) => service.group === activeFilter);
        if (firstInGroup) updateDetail(firstInGroup);
      } else {
        updateDetail(activeService);
      }
    });
  });

  changeButton?.addEventListener('click', () => {
    setFocusedBooking(false);
    renderCards();
    updateDetail(activeService, { scroll: true });
  });

  document.querySelectorAll('[data-booking-open-widget]').forEach((button) => {
    button.addEventListener('click', () => {
      const widgetSection = document.querySelector('[data-booking-widget-section]');
      const loadButton = widgetSection?.querySelector('[data-load-consent-embed]');

      widgetSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => loadButton?.click(), 250);
    });
  });

  setFocusedBooking(focusedBooking);
  renderCards();
  updateDetail(activeService);
})();
