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
      slug: 'prp-consultation',
      group: 'consultations',
      title: 'PRP(Platelet rich plasma) Consultation',
      category: 'Cosmetic Injectables',
      summary: 'A first-step consultation before PRP to confirm suitability and plan the right treatment.',
      price: '£10',
      duration: '20 minutes',
      image: '../assets/images/offer-prp-treatment.webp',
      best: ['PRP planning', 'Suitability check', 'Face, body, scalp or hair-loss advice'],
      prep: ['Bring questions', 'Share medical history', 'Discuss medication at consultation'],
      aftercare: ['Follow your consultation plan', 'Book the recommended PRP option', 'Contact the studio if anything changes'],
    },
    {
      slug: 'laser-rejuvenation-patch-test',
      group: 'consultations',
      title: 'Laser Skin Rejuvenation Compulsory Patch Test',
      category: 'Patch test for Hair',
      summary: 'A compulsory patch test and small assessment before laser skin rejuvenation.',
      price: '£10',
      duration: '20 minutes',
      image: '../assets/images/offer-laser-treatments-cynosure.webp',
      best: ['Safety assessment', 'Sensitivity check', 'First laser rejuvenation visit'],
      prep: ['Avoid tanning and self-tan', 'Share sensitivity history', 'Arrive with clean skin'],
      aftercare: ['Follow your patch-test advice', 'Avoid heat on the tested area', 'Contact the studio if irritation appears'],
    },
    {
      slug: 'hair-loss-consultation',
      group: 'consultations',
      title: 'Hair Loss Consultation',
      category: 'Cosmetic Injectables',
      summary: 'A first-step consultation before hair loss treatment to assess scalp and hair concerns.',
      price: '£10',
      duration: '20 minutes',
      image: '../assets/images/offer-hair-loss-treatment.webp',
      best: ['Hair-loss planning', 'Scalp assessment', 'Mesotherapy or PRP advice'],
      prep: ['Bring questions', 'Share hair-loss history', 'Discuss medication at consultation'],
      aftercare: ['Follow your consultation plan', 'Book the recommended hair-loss treatment', 'Contact the studio if anything changes'],
    },
    {
      slug: 'laser-hair-removal',
      group: 'laser',
      title: 'Laser hair removal',
      category: 'Cynosure Elite',
      summary: 'Long-term hair reduction for face and body areas using Cynosure Elite technology.',
      price: 'From £40',
      duration: '10 min – 3 h 45 min by area',
      image: '../assets/images/offer-laser-treatments-cynosure.webp',
      best: ['Face and body areas', 'Course planning', 'Lower-maintenance skin'],
      prep: ['Avoid tanning and self-tan', 'Shave the area 24 hours before', 'Book a patch test first'],
      aftercare: ['Avoid heat for 24-48 hours', 'Use SPF on exposed areas', 'Follow your aftercare notes'],
    },
    {
      slug: 'laser-rejuvenation',
      group: 'laser',
      title: 'Laser Skin Rejuvenation',
      category: 'Facials - Foto RF™ Skin Rejuvenation',
      summary: 'Laser rejuvenation for the face, neck and décolleté to support brighter, firmer-looking skin.',
      price: 'From £100',
      duration: '45 minutes to 1 hour',
      image: '../assets/images/offer-microneedling.webp',
      best: ['Crow’s feet', 'Fine lines', 'Sagging skin'],
      prep: ['Avoid active exfoliants', 'Use SPF before your visit', 'Arrive with clean skin'],
      aftercare: ['Keep skin calm', 'Avoid heat and strong actives', 'Use daily SPF'],
    },
    {
      slug: 'vascular-treatment',
      group: 'laser',
      title: 'Laser Veins Treatment/Single session(Package available)',
      category: 'Laser Treatment - Thread Veins',
      summary: 'Laser treatment for thread veins and spider veins on areas such as the nose, cheeks, legs and buttocks.',
      price: 'From £45',
      duration: '15 minutes to 1 hour 20 minutes',
      image: '../assets/images/offer-laser-treatments-cynosure.webp',
      best: ['Thread veins', 'Spider veins', 'Nose, cheeks and legs'],
      prep: ['Avoid tanning', 'Pause strong actives as advised', 'Share medication details'],
      aftercare: ['Avoid heat and exercise', 'Protect the area from sun', 'Follow clinic guidance'],
    },
    {
      slug: 'laser-veins-patch-test',
      group: 'laser',
      title: 'Laser Veins Compulsory Patch Test',
      category: 'Patch test for Hair',
      summary: 'A compulsory patch test and small assessment before laser veins treatment.',
      price: '£10',
      duration: '20 minutes',
      image: '../assets/images/offer-laser-treatments-cynosure.webp',
      best: ['Safety assessment', 'Sensitivity check', 'First laser veins visit'],
      prep: ['Avoid tanning and self-tan', 'Share sensitivity history', 'Arrive with clean skin'],
      aftercare: ['Follow your patch-test advice', 'Avoid heat on the tested area', 'Contact the studio if irritation appears'],
    },
    {
      slug: 'electrolysis',
      group: 'laser',
      title: 'Electrolysis permanent hair removal',
      category: 'Apilus',
      summary: 'Precision permanent hair removal for smaller areas using Apilus electrolysis.',
      price: 'From £10',
      duration: '15–60 minute sessions',
      image: '../assets/images/offer-electrolysis-apilus.webp',
      best: ['Small areas', 'Fine detail work', 'Permanent hair removal plans'],
      prep: ['Do not wax before treatment', 'Keep hair visible enough to treat', 'Avoid irritating products'],
      aftercare: ['Keep the area clean', 'Avoid touching or picking', 'Avoid heat for 24 hours'],
    },
    {
      slug: 'prp',
      group: 'injectables',
      title: 'PRP(Platelet Rich Plasma)',
      category: 'Cosmetic Injectables',
      summary: 'PRP skin rejuvenation and hair-loss PRP with 1, 3 and 5-session choices.',
      price: 'From £240',
      duration: '50 minutes',
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
      duration: '30 minutes',
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
      duration: '30 minutes',
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
      duration: '40 minutes',
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
      duration: '30–40 minutes',
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
      duration: '40–50 minutes',
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
      duration: '40 min – 1 h 20 min',
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
      duration: '45 minutes',
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
      duration: '1 h – 1 h 30 min',
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
      duration: '1 h – 1 h 30 min',
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
      duration: '25 min – 1 h 20 min',
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
      duration: '45 min – 1 h',
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
  // Treatwell's embedded widget always opens the full venue menu — it can't be
  // deep-linked to a single treatment — so we name the chosen treatment here to
  // make picking the right one in the calendar effortless.
  const widgetHint = document.querySelector('[data-booking-widget-hint]');

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
    if (widgetHint) {
      widgetHint.textContent = `In the Treatwell calendar below, choose “${service.title}”, then pick your appointment time and confirm securely without leaving this page.`;
    }

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
