const STORAGE_KEY = "lumi-derm-admin-draft-v1";

const imageOptions = [
  "offer-laser-treatments-cynosure.webp",
  "offer-electrolysis-apilus.webp",
  "offer-endospheres-therapy.webp",
  "offer-prp-treatment.webp",
  "offer-skin-boosters.webp",
  "offer-lip-boosters.webp",
  "offer-mesotherapy.webp",
  "offer-facials.webp",
  "offer-microneedling.webp",
  "offer-peels.webp",
  "offer-exosomes.webp",
  "offer-lashes-brows.webp",
  "iulia-professional-portrait.webp",
  "about-lumi-derm-studio.webp",
  "gallery-preview-01.webp",
  "gallery-preview-02.webp"
];

const defaultOffers = [
  {
    title: "Laser treatments",
    category: "Cynosure Elite",
    price: "from £45",
    description: "Laser hair removal, rejuvenation and vascular treatment planning.",
    image: "offer-laser-treatments-cynosure.webp",
    status: "Published",
    priority: 1
  },
  {
    title: "Endospheres therapy",
    category: "Body therapy",
    price: "from £50",
    description: "Body-focused lymphatic drainage, smoothing and contour support.",
    image: "offer-endospheres-therapy.webp",
    status: "Published",
    priority: 2
  },
  {
    title: "Skin boosters",
    category: "Injectable skin support",
    price: "from £120",
    description: "Profhilo and polynucleotide treatment plans for hydration support.",
    image: "offer-skin-boosters.webp",
    status: "Published",
    priority: 3
  },
  {
    title: "Facials and peels",
    category: "Skin polish",
    price: "from £70",
    description: "Deep cleansing, dermaplaning, microdermabrasion and tailored peels.",
    image: "offer-facials.webp",
    status: "Draft",
    priority: 4
  }
];

const defaultPriceGroups = [
  {
    id: "laser",
    label: "Cynosure Elite",
    title: "Laser treatments",
    min: "from £10",
    rows: [
      ["Laser consultation", "£10"],
      ["Laser hair removal", "from £45"],
      ["Laser rejuvenation / vascular", "consultation"]
    ]
  },
  {
    id: "electrolysis",
    label: "Apilus",
    title: "Electrolysis permanent hair removal",
    min: "from £10",
    rows: [
      ["Electrolysis consultation", "£10"],
      ["15 minutes", "£35"],
      ["30 minutes", "£55"],
      ["60 minutes", "£90"]
    ]
  },
  {
    id: "boosters",
    label: "Injectable skin support",
    title: "Skin boosters",
    min: "from £120",
    rows: [
      ["Skin boosters consultation", "£10"],
      ["Profhilo", "£265 / 1 session"],
      ["Profhilo course", "£490 / 2 sessions"],
      ["Polynucleotides eyes", "£220 / 1 session"]
    ]
  },
  {
    id: "facials",
    label: "Facials",
    title: "Facials and skin polish",
    min: "from £70",
    rows: [
      ["Facial consultation", "£10"],
      ["Fire & Ice by IS Clinical Facial + LED Therapy", "£90"],
      ["Bespoke deep cleansing facial", "£100"],
      ["Microdermabrasion", "£70"]
    ]
  }
];

const state = loadDraft();
let selectedOfferIndex = 0;
let selectedPriceGroupId = state.priceGroups[0]?.id || "laser";

const navButtons = document.querySelectorAll("[data-admin-panel]");
const panels = document.querySelectorAll("[data-admin-section]");
const toastRegion = document.querySelector("[data-admin-toast-region]");

init();

function init() {
  bindNavigation();
  bindGenericToasts();
  bindTopActions();
  bindOffers();
  bindPrices();
  bindReviews();
  bindContent();
  renderAll();
  loadReviewsFromJson();
}

function loadDraft() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      offers: Array.isArray(stored.offers) ? stored.offers : structuredClone(defaultOffers),
      priceGroups: Array.isArray(stored.priceGroups) ? stored.priceGroups : structuredClone(defaultPriceGroups),
      reviews: Array.isArray(stored.reviews) ? stored.reviews : [],
      content: stored.content || {},
      savedAt: stored.savedAt || null
    };
  } catch {
    return {
      offers: structuredClone(defaultOffers),
      priceGroups: structuredClone(defaultPriceGroups),
      reviews: [],
      content: {},
      savedAt: null
    };
  }
}

function saveDraft(message = "Draft saved in this browser.") {
  state.savedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateDraftCount();
  toast(message);
}

function bindNavigation() {
  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      navButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      panels.forEach((panel) => panel.classList.toggle("is-active", panel.id === button.dataset.adminPanel));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function bindGenericToasts() {
  document.querySelectorAll("[data-admin-toast]").forEach((button) => {
    button.addEventListener("click", () => toast(button.dataset.adminToast));
  });
  document.querySelector("[data-demo-upload]")?.addEventListener("click", () => {
    toast("Uploads should go through the CMS media library or a protected Worker upload endpoint.");
  });
}

function bindTopActions() {
  document.querySelector("[data-export-admin]")?.addEventListener("click", exportDraft);
  document.querySelector("[data-publish-demo]")?.addEventListener("click", () => {
    toast("Publish checklist: add Cloudflare Access, connect Sveltia CMS or protected API, test Square links, then redeploy.");
  });
}

function bindOffers() {
  document.querySelector("[data-add-offer]")?.addEventListener("click", () => {
    state.offers.push({
      title: "New offer",
      category: "Draft",
      price: "from £",
      description: "Short offer description.",
      image: imageOptions[0],
      status: "Draft",
      priority: state.offers.length + 1
    });
    selectedOfferIndex = state.offers.length - 1;
    renderOffers();
    saveDraft("Offer draft added.");
  });

  document.querySelector("[data-save-offer]")?.addEventListener("click", () => {
    const offer = state.offers[selectedOfferIndex];
    if (!offer) return;
    document.querySelectorAll("[data-offer-field]").forEach((field) => {
      offer[field.dataset.offerField] = field.value;
    });
    renderOffers();
    saveDraft("Offer draft updated.");
  });
}

function bindPrices() {
  document.querySelector("[data-add-price-group]")?.addEventListener("click", () => {
    const id = `group-${Date.now()}`;
    state.priceGroups.push({
      id,
      label: "Draft group",
      title: "New price group",
      min: "from £",
      rows: [["New service", "£"]]
    });
    selectedPriceGroupId = id;
    renderPrices();
    saveDraft("Price group draft added.");
  });

  document.querySelector("[data-add-price-row]")?.addEventListener("click", () => {
    const group = getSelectedPriceGroup();
    if (!group) return;
    group.rows.push(["New item", "£"]);
    renderPriceEditor(group);
    saveDraft("Price row added.");
  });
}

function bindReviews() {
  document.querySelector("[data-review-filter]")?.addEventListener("change", renderReviews);
  document.querySelector("[data-sync-google]")?.addEventListener("click", () => {
    const imported = {
      name: "Google review",
      initial: "G",
      rating: 5,
      treatment: "Imported from Google",
      source: "Google Business Profile",
      text: "Pending imported Google review. Approve before it appears publicly.",
      status: "pending",
      featured: false
    };
    state.reviews.unshift(imported);
    renderReviews();
    saveDraft("Google review placeholder imported as pending.");
  });
  document.querySelector("[data-add-review]")?.addEventListener("click", () => {
    state.reviews.unshift({
      name: "Manual review",
      initial: "M",
      rating: 5,
      treatment: "Client feedback",
      source: "Manual entry",
      text: "Add the approved client quote here.",
      status: "pending",
      featured: false
    });
    renderReviews();
    saveDraft("Manual review added as pending.");
  });
}

function bindContent() {
  document.querySelector("[data-save-content]")?.addEventListener("click", () => {
    document.querySelectorAll("[data-content-field]").forEach((field) => {
      state.content[field.dataset.contentField] = field.value;
    });
    saveDraft("Page content draft saved.");
  });
}

function renderAll() {
  renderOfferImageOptions();
  renderOffers();
  renderPrices();
  renderMedia();
  updateDraftCount();
  updateReviewCount();
}

function renderOfferImageOptions() {
  const select = document.querySelector('[data-offer-field="image"]');
  if (!select) return;
  select.innerHTML = imageOptions.map((image) => `<option value="${escapeHtml(image)}">${escapeHtml(image)}</option>`).join("");
}

function renderOffers() {
  const table = document.querySelector("[data-offer-table]");
  if (!table) return;
  table.innerHTML = state.offers.map((offer, index) => `
    <tr>
      <td><strong>${escapeHtml(offer.title)}</strong><span>${escapeHtml(offer.category)}</span></td>
      <td>${escapeHtml(offer.price)}</td>
      <td><span class="status-pill">${escapeHtml(offer.status)}</span></td>
      <td>${Number(offer.priority) || index + 1}</td>
      <td><button type="button" data-edit-offer="${index}">Edit</button></td>
    </tr>
  `).join("");

  table.querySelectorAll("[data-edit-offer]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedOfferIndex = Number(button.dataset.editOffer);
      populateOfferEditor();
    });
  });
  populateOfferEditor();
}

function populateOfferEditor() {
  const offer = state.offers[selectedOfferIndex];
  if (!offer) return;
  document.querySelectorAll("[data-offer-field]").forEach((field) => {
    field.value = offer[field.dataset.offerField] || "";
  });
}

function renderPrices() {
  const wrap = document.querySelector("[data-price-groups]");
  if (!wrap) return;
  wrap.innerHTML = state.priceGroups.map((group) => `
    <article class="admin-card price-group-card ${group.id === selectedPriceGroupId ? "is-selected" : ""}">
      <div>
        <small>${escapeHtml(group.label)}</small>
        <strong>${escapeHtml(group.title)}</strong>
      </div>
      <span>${escapeHtml(group.min)} · ${group.rows.length} rows</span>
      <button type="button" aria-label="Edit ${escapeHtml(group.title)}" data-select-price-group="${escapeHtml(group.id)}"></button>
    </article>
  `).join("");

  wrap.querySelectorAll("[data-select-price-group]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPriceGroupId = button.dataset.selectPriceGroup;
      renderPrices();
    });
  });
  renderPriceEditor(getSelectedPriceGroup());
}

function renderPriceEditor(group) {
  const title = document.querySelector("[data-price-editor-title]");
  const editor = document.querySelector("[data-price-row-editor]");
  if (!group || !editor) return;
  if (title) title.textContent = group.title;

  editor.innerHTML = group.rows.map((row, index) => `
    <div class="field-row">
      <label>Service<input type="text" value="${escapeAttr(row[0])}" data-price-row="${index}" data-price-cell="0"></label>
      <label>Price<input type="text" value="${escapeAttr(row[1])}" data-price-row="${index}" data-price-cell="1"></label>
      <button class="tiny-button" type="button" data-remove-price-row="${index}">Remove</button>
    </div>
  `).join("");

  editor.querySelectorAll("[data-price-cell]").forEach((input) => {
    input.addEventListener("change", () => {
      group.rows[Number(input.dataset.priceRow)][Number(input.dataset.priceCell)] = input.value;
      saveDraft("Price row updated.");
    });
  });
  editor.querySelectorAll("[data-remove-price-row]").forEach((button) => {
    button.addEventListener("click", () => {
      group.rows.splice(Number(button.dataset.removePriceRow), 1);
      renderPriceEditor(group);
      saveDraft("Price row removed.");
    });
  });
}

function getSelectedPriceGroup() {
  return state.priceGroups.find((group) => group.id === selectedPriceGroupId) || state.priceGroups[0];
}

async function loadReviewsFromJson() {
  if (state.reviews.length) {
    renderReviews();
    return;
  }
  try {
    const response = await fetch("../assets/data/reviews.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Reviews unavailable");
    const data = await response.json();
    state.reviews = (data.reviews || []).map((review, index) => ({
      ...review,
      status: index < 10 ? "approved" : "pending",
      featured: index < 3
    }));
    updateReviewCount(data.summary?.count || state.reviews.length);
    renderReviews();
  } catch {
    state.reviews = [];
    renderReviews();
    toast("Could not load local reviews JSON.");
  }
}

function renderReviews() {
  const list = document.querySelector("[data-review-list]");
  const filter = document.querySelector("[data-review-filter]")?.value || "all";
  if (!list) return;

  const reviews = state.reviews.filter((review) => {
    if (filter === "all") return true;
    if (filter === "featured") return review.featured;
    return review.status === filter;
  });

  list.innerHTML = reviews.map((review, index) => {
    const realIndex = state.reviews.indexOf(review);
    return `
      <article class="admin-review-item">
        <div>
          <div class="review-meta">
            <strong>${escapeHtml(review.name || "Client")}</strong>
            <span class="review-stars">${"★".repeat(Number(review.rating) || 5)}</span>
            <span class="status-pill">${escapeHtml(review.status || "approved")}</span>
            ${review.featured ? '<span class="status-pill">featured</span>' : ""}
          </div>
          <p>${escapeHtml(review.text || "")}</p>
          <small>${escapeHtml(review.treatment || "Treatment")} · ${escapeHtml(review.source || "Client review")}</small>
        </div>
        <div class="review-actions">
          <button class="tiny-button" type="button" data-review-action="approved" data-review-index="${realIndex}">Approve</button>
          <button class="tiny-button" type="button" data-review-action="featured" data-review-index="${realIndex}">${review.featured ? "Unfeature" : "Feature"}</button>
          <button class="tiny-button" type="button" data-review-action="hidden" data-review-index="${realIndex}">Hide</button>
          <button class="tiny-button" type="button" data-review-action="pending" data-review-index="${realIndex}">Pending</button>
        </div>
      </article>
    `;
  }).join("") || '<article class="admin-review-item"><p>No reviews match this filter.</p></article>';

  list.querySelectorAll("[data-review-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const review = state.reviews[Number(button.dataset.reviewIndex)];
      if (!review) return;
      if (button.dataset.reviewAction === "featured") {
        review.featured = !review.featured;
      } else {
        review.status = button.dataset.reviewAction;
      }
      renderReviews();
      saveDraft("Review queue updated.");
    });
  });
  updateReviewCount();
}

function renderMedia() {
  const grid = document.querySelector("[data-media-grid]");
  if (!grid) return;
  grid.innerHTML = imageOptions.map((image) => `
    <article class="media-item">
      <img src="../assets/images/${escapeAttr(image)}" alt="">
      <div><strong>${escapeHtml(image)}</strong><small>Local asset</small></div>
    </article>
  `).join("");
}

function updateDraftCount() {
  const count = [
    state.offers.length,
    state.priceGroups.length,
    Object.keys(state.content || {}).length
  ].reduce((sum, value) => sum + value, 0);
  document.querySelector("[data-draft-count]")?.replaceChildren(String(count));
}

function updateReviewCount(forcedCount) {
  const count = forcedCount || state.reviews.length || 43;
  document.querySelector("[data-review-count]")?.replaceChildren(String(count));
}

function exportDraft() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `lumi-admin-draft-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Draft JSON exported.");
}

function toast(message) {
  if (!toastRegion || !message) return;
  const node = document.createElement("div");
  node.className = "admin-toast-message";
  node.textContent = message;
  toastRegion.appendChild(node);
  window.setTimeout(() => node.remove(), 3800);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
