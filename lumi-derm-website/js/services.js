/* Services page: open each treatment's full detail in a modal (no long scrolling). */
(function () {
  const cards = document.querySelectorAll('[data-tx-card]');
  const modal = document.querySelector('[data-tx-modal]');
  if (!modal || !cards.length) return;

  const titleEl = modal.querySelector('[data-tx-title]');
  const subEl = modal.querySelector('[data-tx-sub]');
  const priceEl = modal.querySelector('[data-tx-price]');
  const bodyEl = modal.querySelector('[data-tx-body]');
  const closeEls = modal.querySelectorAll('[data-tx-close]');
  const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let lastFocus = null;
  let activeCardId = '';

  function openModal(card) {
    const title = card.querySelector('.tx-title');
    const sub = card.querySelector('.tx-sub');
    const price = card.querySelector('.tx-price');
    const detail = card.querySelector('.tx-card-detail');

    titleEl.textContent = title ? title.textContent : '';
    if (subEl) subEl.textContent = sub ? sub.textContent : '';
    if (priceEl) priceEl.textContent = price ? price.textContent : '';
    bodyEl.innerHTML = detail ? detail.innerHTML : '';

    lastFocus = document.activeElement;
    activeCardId = card.id || '';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('tx-modal-active');
    const closeBtn = modal.querySelector('.tx-modal-close');
    requestAnimationFrame(() => closeBtn && closeBtn.focus());
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('tx-modal-active');
    modal.querySelector('.tx-modal-panel').scrollTop = 0;
    if (activeCardId && window.location.hash === `#${activeCardId}`) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    activeCardId = '';
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  cards.forEach((card) => {
    const btn = card.querySelector('[data-tx-open]');
    if (btn) {
      btn.addEventListener('click', () => {
        if (card.id) window.history.replaceState(null, '', `#${card.id}`);
        openModal(card);
      });
    }
  });
  closeEls.forEach((el) => el.addEventListener('click', closeModal));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  // Keep focus inside the modal while open.
  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !modal.classList.contains('is-open')) return;
    const f = Array.from(modal.querySelectorAll(focusableSelector)).filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function openFromHash() {
    const id = window.location.hash.slice(1);
    const card = id ? document.getElementById(id) : null;
    if (card && card.matches('[data-tx-card]')) openModal(card);
  }

  window.addEventListener('hashchange', openFromHash);
  requestAnimationFrame(openFromHash);
})();
