/* Lumi Derm Admin — client-side website workspace.
   Website content persists in localStorage as drafts. Treatwell remains the
   external system of record for bookings, payments and client information. */

const STORAGE_KEY = "lumi-derm-admin-draft-v2";
const PASS_KEY = "lumi-derm-admin-pass";
const UNLOCK_KEY = "lumi-derm-admin-unlocked";
const DEFAULT_PASS = "lumiderm";

const imageOptions = [
  "offer-laser-treatments-cynosure.webp", "offer-electrolysis-apilus.webp",
  "offer-endospheres-therapy.webp", "offer-prp-treatment.webp",
  "offer-skin-boosters.webp", "offer-lip-boosters.webp", "offer-mesotherapy.webp",
  "offer-facials.webp", "offer-microneedling.webp", "offer-peels.webp",
  "offer-exosomes.webp", "offer-lashes-brows.webp", "offer-hair-loss-treatment.webp",
  "iulia-professional-portrait.webp", "about-lumi-derm-studio.webp",
  "gallery-preview-01.webp", "gallery-preview-02.webp"
];

const defaultOffers = [
  { title: "Laser treatments", category: "Cynosure Elite", price: "from £40", description: "Laser hair removal, rejuvenation and vascular treatment planning.", image: "offer-laser-treatments-cynosure.webp", status: "Published", priority: 1 },
  { title: "Endospheres therapy", category: "Body therapy", price: "from £50", description: "Body-focused lymphatic drainage, smoothing and contour support.", image: "offer-endospheres-therapy.webp", status: "Published", priority: 2 },
  { title: "Skin boosters", category: "Injectable skin support", price: "from £220", description: "Profhilo and polynucleotide treatment plans for hydration support.", image: "offer-skin-boosters.webp", status: "Published", priority: 3 },
  { title: "Facials & peels", category: "Skin polish", price: "from £70", description: "Deep cleansing, dermaplaning, microdermabrasion and tailored peels.", image: "offer-facials.webp", status: "Draft", priority: 4 }
];

const defaultPriceGroups = [
  { id: "laser", label: "Cynosure Elite", title: "Laser treatments", min: "from £40", rows: [
    ["Hair removal — upper lip / eyebrows / nose / ears", "£40 / 1 · £35 each / 6 · £30 each / 10"],
    ["Hair removal — chin / side of face / hair line", "£60 / 1 · £50 each / 6 · £45 each / 10"],
    ["Hair removal — neck / jawline", "£80 / 1 · £70 each / 6 · £65 each / 10"],
    ["Hair removal — half face / beard", "£100 / 1 · £85 each / 6 · £80 each / 10"],
    ["Hair removal — full face", "£125 / 1 · £105 each / 6 · £95 each / 10"],
    ["Hair removal — underarms / hands & fingers / navel line", "£60 / 1 · £50 each / 6 · £45 each / 10"],
    ["Hair removal — chest / abdomen / half arms", "£100 / 1 · £85 each / 6 · £80 each / 10"],
    ["Hair removal — full back / chest + abdomen / full arms", "£125 / 1 · £105 each / 6 · £95 each / 10"],
    ["Hair removal — bikini line / peri-anal / feet & toes", "£60 / 1 · £50 each / 6 · £45 each / 10"],
    ["Hair removal — extended bikini", "£70 / 1 · £60 each / 6 · £55 each / 10"],
    ["Hair removal — Brazilian", "£80 / 1 · £70 each / 6 · £65 each / 10"],
    ["Hair removal — Hollywood / buttocks", "£100 / 1 · £85 each / 6 · £80 each / 10"],
    ["Hair removal — lower legs / thighs", "£120 / 1 · £105 each / 6 · £95 each / 10"],
    ["Hair removal — full legs", "£150 / 1 · £130 each / 6 · £120 each / 10"],
    ["Hair removal — full body women", "£400 / 1 · £350 each / 6 · £300 each / 10"],
    ["Hair removal — full body men", "£450 / 1 · £375 each / 6 · £325 each / 10"],
    ["Multi-area package discounts", "2 areas 15% · 3 areas 20% · 4 areas 25% · 5 areas 30%"],
    ["Vascular — small area, e.g. nose", "£45 / 1 · £85 / 2 · £120 / 3"],
    ["Vascular — medium area, e.g. face", "£80 / 1 · £150 / 2 · £210 / 3"],
    ["Vascular — large area, e.g. leg", "£125 / 1 · £235 / 2 · £330 / 3"],
    ["Vascular — extra-large area, e.g. both legs", "£180 / 1 · £340 / 2 · £480 / 3"],
    ["Skin rejuvenation — face + neck", "£100 / 1 · £270 / 3"],
    ["Skin rejuvenation — face + neck + decollete", "£130 / 1 · £330 / 3"],
    ["Package instalments", "Available at the venue"]
  ] },
  { id: "electrolysis", label: "Apilus", title: "Electrolysis permanent hair removal", min: "from £10", rows: [["Electrolysis consultation", "£10"], ["15 minutes", "£30"], ["30 minutes", "£50"], ["60 minutes", "£100"]] },
  { id: "boosters", label: "Injectable skin support", title: "Skin boosters", min: "from £120", rows: [["Skin boosters consultation", "£10"], ["Profhilo", "£265 / 1 session"], ["Profhilo course", "£490 / 2 sessions"], ["Polynucleotides eyes", "£220 / 1 session"]] },
  { id: "facials", label: "Facials", title: "Facials and skin polish", min: "from £70", rows: [["Facial consultation", "£10"], ["Fire & Ice by IS Clinical + LED", "£90"], ["Bespoke deep cleansing facial", "£100"], ["Microdermabrasion", "£70"]] }
];

const panelTitles = { dashboard: "Overview", guide: "Guide & help", offers: "Offers", prices: "Prices", sender: "Send email", subscribers: "Subscribers", reviews: "Reviews", media: "Media", content: "Pages", clients: "Treatwell", settings: "Settings" };

let state = loadDraft();
let selectedOfferIndex = 0;
let selectedPriceGroupId = state.priceGroups[0]?.id || "laser";

const toastRegion = document.querySelector("[data-admin-toast-region]");

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initGate);
} else {
  initGate();
}

/* ---------------- Gate ---------------- */
function reveal(gate, shell) {
  gate.hidden = true;
  shell.hidden = false;
  try { runApp(); }
  catch (err) { console.error("[admin] app init error (still unlocked):", err); }
}

function initGate() {
  const gate = document.querySelector("[data-admin-gate]");
  const shell = document.querySelector("[data-admin-shell]");
  if (!gate || !shell) { console.error("[admin] gate or shell element not found"); return; }

  if (sessionStorage.getItem(UNLOCK_KEY) === "1") {
    reveal(gate, shell);
    return;
  }
  gate.hidden = false;
  shell.hidden = true;

  const input = document.querySelector("[data-gate-input]");
  function tryUnlock() {
    const pass = localStorage.getItem(PASS_KEY) || DEFAULT_PASS;
    const entered = (input?.value || "").trim().toLowerCase();
    if (entered === pass.trim().toLowerCase()) {
      sessionStorage.setItem(UNLOCK_KEY, "1");
      reveal(gate, shell);
    } else {
      if (input) { input.value = ""; input.focus(); }
      toast("Incorrect passcode.");
    }
  }

  const btn = document.querySelector("[data-gate-unlock]");
  const form = document.querySelector("[data-gate-form]");
  btn?.addEventListener("click", (e) => { e.preventDefault(); tryUnlock(); });
  form?.addEventListener("submit", (e) => { e.preventDefault(); tryUnlock(); });
  input?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); tryUnlock(); } });
}

function runApp() {
  bindNavigation();
  bindTopActions();
  bindOffers();
  bindPrices();
  bindReviews();
  bindContent();
  bindSettings();
  bindGenericToasts();
  bindPublishing();
  bindImageUpload();
  renderAll();
  loadReviewsFromJson();
  // First run (no local draft yet) -> start from the offers actually on the website.
  if (!localStorage.getItem(STORAGE_KEY)) loadOffersFromSite(false);
}

/* ---------------- Storage ---------------- */
function loadDraft() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      offers: Array.isArray(s.offers) ? s.offers : structuredClone(defaultOffers),
      priceGroups: Array.isArray(s.priceGroups) ? s.priceGroups : structuredClone(defaultPriceGroups),
      reviews: Array.isArray(s.reviews) ? s.reviews : [],
      content: s.content || {},
      campaigns: Array.isArray(s.campaigns) ? s.campaigns : [],
      savedAt: s.savedAt || null
    };
  } catch {
    return { offers: structuredClone(defaultOffers), priceGroups: structuredClone(defaultPriceGroups), reviews: [], content: {}, campaigns: [], savedAt: null };
  }
}

function saveDraft(message) {
  state.savedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateLastSaved();
  updateMetrics();
  if (message) toast(message);
}

function updateLastSaved() {
  const el = document.querySelector("[data-last-saved]");
  if (!el) return;
  if (!state.savedAt) { el.textContent = "No changes saved yet."; return; }
  const d = new Date(state.savedAt);
  el.textContent = "Saved " + d.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) + " · in this browser";
}

/* ---------------- Navigation ---------------- */
function bindNavigation() {
  const navButtons = document.querySelectorAll("[data-admin-panel]");
  const panels = document.querySelectorAll("[data-admin-section]");
  navButtons.forEach((button) => {
    button.addEventListener("click", () => goPanel(button.dataset.adminPanel, navButtons, panels));
  });
  document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => goPanel(b.dataset.go, navButtons, panels)));
}

function goPanel(id, navButtons, panels) {
  navButtons = navButtons || document.querySelectorAll("[data-admin-panel]");
  panels = panels || document.querySelectorAll("[data-admin-section]");
  navButtons.forEach((i) => i.classList.toggle("is-active", i.dataset.adminPanel === id));
  panels.forEach((p) => p.classList.toggle("is-active", p.id === id));
  const title = document.querySelector("[data-panel-title]");
  if (title) title.textContent = panelTitles[id] || "Admin";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------------- Top actions ---------------- */
function bindTopActions() {
  document.querySelectorAll("[data-export-admin]").forEach((b) => b.addEventListener("click", exportAll));
  document.querySelectorAll("[data-import-admin]").forEach((b) => b.addEventListener("click", () => document.querySelector("[data-import-file]").click()));
  document.querySelector("[data-import-file]")?.addEventListener("change", importAll);
  document.querySelector("[data-publish-demo]")?.addEventListener("click", () => { goPanel("offers"); publishOffers(); });
}

function exportAll() {
  download(`lumi-admin-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), "application/json");
  toast("Backup exported.");
}

function importAll(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      state = { ...state, ...data };
      ["offers", "priceGroups", "reviews", "campaigns"].forEach((k) => { if (!Array.isArray(state[k])) state[k] = []; });
      selectedOfferIndex = 0;
      renderAll(); saveDraft("Backup imported.");
    } catch { toast("That file could not be read as a valid backup."); }
    e.target.value = "";
  };
  reader.readAsText(file);
}

/* ---------------- Offers ---------------- */
function bindOffers() {
  document.querySelector("[data-add-offer]")?.addEventListener("click", () => {
    state.offers.push({ title: "New offer", category: "Offer", price: "From £", badge: "", description: "Short offer description.", image: imageOptions[0], service: "", status: "Draft", featured: false, expires: "", note: "Ongoing offer" });
    selectedOfferIndex = state.offers.length - 1;
    renderOffers();
    saveDraft("New offer added \u2014 fill it in below, then Save changes.");
    document.querySelector('[data-offer-field="title"]')?.focus();
  });
  document.querySelector("[data-save-offer]")?.addEventListener("click", () => {
    const offer = state.offers[selectedOfferIndex]; if (!offer) return;
    document.querySelectorAll("[data-offer-field]").forEach((f) => {
      offer[f.dataset.offerField] = f.type === "checkbox" ? f.checked : f.value;
    });
    renderOffers(); saveDraft("Offer saved.");
  });
  document.querySelector("[data-save-new-offer]")?.addEventListener("click", () => {
    const fresh = {};
    document.querySelectorAll("[data-offer-field]").forEach((f) => {
      fresh[f.dataset.offerField] = f.type === "checkbox" ? f.checked : f.value;
    });
    if (!fresh.title || !fresh.title.trim()) { toast("Give the offer a title first."); return; }
    fresh.featured = fresh.featured === true;
    state.offers.push(fresh);
    selectedOfferIndex = state.offers.length - 1;
    renderOffers();
    saveDraft("Added as a new offer (nothing was overwritten).");
  });

  document.querySelectorAll("[data-offer-field]").forEach((f) => f.addEventListener("input", renderOfferPreview));
}

function renderOffers() {
  const table = document.querySelector("[data-offer-table]"); if (!table) return;
  table.innerHTML = state.offers.map((o, i) => `
    <tr class="${i === selectedOfferIndex ? "is-selected" : ""}">
      <td><strong>${escapeHtml(o.title)}</strong><span>${escapeHtml(o.category)}</span></td>
      <td>${escapeHtml(o.price)}</td>
      <td><span class="status-pill status-${(o.status || "").toLowerCase()}">${escapeHtml(o.status)}</span></td>
      <td>${i + 1}</td>
      <td class="row-actions">
        <button class="tiny-button" type="button" data-edit-offer="${i}">Edit</button>
        <button class="tiny-button" type="button" data-move-offer="${i}" data-dir="-1" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="tiny-button" type="button" data-move-offer="${i}" data-dir="1" ${i === state.offers.length - 1 ? "disabled" : ""}>↓</button>
        <button class="tiny-button" type="button" data-dup-offer="${i}">Duplicate</button>
        <button class="tiny-button danger" type="button" data-del-offer="${i}">Delete</button>
      </td>
    </tr>`).join("") || '<tr><td colspan="5">No offers yet — add one.</td></tr>';

  table.querySelectorAll("[data-edit-offer]").forEach((b) => b.addEventListener("click", () => { selectedOfferIndex = +b.dataset.editOffer; populateOfferEditor(); }));
  table.querySelectorAll("[data-move-offer]").forEach((b) => b.addEventListener("click", () => moveOffer(+b.dataset.moveOffer, +b.dataset.dir)));
  table.querySelectorAll("[data-dup-offer]").forEach((b) => b.addEventListener("click", () => { const o = state.offers[+b.dataset.dupOffer]; state.offers.splice(+b.dataset.dupOffer + 1, 0, { ...o, title: o.title + " (copy)", status: "Draft" }); renderOffers(); saveDraft("Offer duplicated."); }));
  table.querySelectorAll("[data-del-offer]").forEach((b) => b.addEventListener("click", () => deleteOffer(+b.dataset.delOffer)));
  populateOfferEditor();
}

function moveOffer(i, dir) {
  const j = i + dir; if (j < 0 || j >= state.offers.length) return;
  [state.offers[i], state.offers[j]] = [state.offers[j], state.offers[i]];
  selectedOfferIndex = j; renderOffers(); saveDraft("Order updated.");
}

function populateOfferEditor() {
  const offer = state.offers[selectedOfferIndex];
  const banner = document.querySelector("[data-offer-editing]");
  if (banner) {
    banner.textContent = offer
      ? "Editing offer " + (selectedOfferIndex + 1) + " of " + state.offers.length + ": \u201c" + (offer.title || "Untitled") + "\u201d"
      : "No offer selected";
  }
  if (!offer) return;
  document.querySelectorAll("[data-offer-field]").forEach((f) => {
    const key = f.dataset.offerField;
    if (f.type === "checkbox") f.checked = offer[key] === true;
    else f.value = offer[key] || "";
  });
  renderOfferPreview();
}

function renderOfferPreview() {
  const box = document.querySelector("[data-offer-preview]"); if (!box) return;
  const get = (k) => document.querySelector(`[data-offer-field="${k}"]`)?.value || "";
  box.innerHTML = `
    <div class="offer-preview-card">
      <img src="../assets/images/${escapeAttr(get("image"))}" alt="" data-hide-on-error>
      <div>
        <span>${escapeHtml(get("category") || "Category")}</span>
        <strong>${escapeHtml(get("title") || "Offer title")}</strong>
        <p>${escapeHtml(get("description") || "Short description")}</p>
        <b>${escapeHtml(get("price") || "from £")}</b>
      </div>
    </div>`;
}

/* ---------------- Prices ---------------- */
function bindPrices() {
  document.querySelector("[data-add-price-group]")?.addEventListener("click", () => {
    const id = `group-${Date.now()}`;
    state.priceGroups.push({ id, label: "Draft group", title: "New price group", min: "from £", rows: [["New service", "£"]] });
    selectedPriceGroupId = id; renderPrices(); saveDraft("Price group added.");
  });
  document.querySelector("[data-add-price-row]")?.addEventListener("click", () => {
    const g = getSelectedPriceGroup(); if (!g) return;
    g.rows.push(["New item", "£"]); renderPriceEditor(g); saveDraft("Row added.");
  });
  document.querySelector("[data-delete-price-group]")?.addEventListener("click", () => {
    if (state.priceGroups.length <= 1) { toast("Keep at least one group."); return; }
    if (!confirm("Delete this price group?")) return;
    state.priceGroups = state.priceGroups.filter((g) => g.id !== selectedPriceGroupId);
    selectedPriceGroupId = state.priceGroups[0].id; renderPrices(); saveDraft("Group deleted.");
  });
  document.querySelector("[data-price-group-title]")?.addEventListener("change", (e) => {
    const g = getSelectedPriceGroup(); if (!g) return; g.title = e.target.value; renderPrices(); saveDraft("Group renamed.");
  });
}

function renderPrices() {
  const wrap = document.querySelector("[data-price-groups]"); if (!wrap) return;
  wrap.innerHTML = state.priceGroups.map((g) => `
    <article class="admin-card price-group-card ${g.id === selectedPriceGroupId ? "is-selected" : ""}">
      <div><small>${escapeHtml(g.label)}</small><strong>${escapeHtml(g.title)}</strong></div>
      <span>${escapeHtml(g.min)} · ${g.rows.length} rows</span>
      <button type="button" aria-label="Edit ${escapeHtml(g.title)}" data-select-price-group="${escapeHtml(g.id)}"></button>
    </article>`).join("");
  wrap.querySelectorAll("[data-select-price-group]").forEach((b) => b.addEventListener("click", () => { selectedPriceGroupId = b.dataset.selectPriceGroup; renderPrices(); }));
  const g = getSelectedPriceGroup();
  const titleInput = document.querySelector("[data-price-group-title]"); if (titleInput && g) titleInput.value = g.title;
  renderPriceEditor(g);
}

function renderPriceEditor(group) {
  const title = document.querySelector("[data-price-editor-title]");
  const editor = document.querySelector("[data-price-row-editor]");
  if (!group || !editor) return;
  if (title) title.textContent = group.title;
  editor.innerHTML = group.rows.map((row, i) => `
    <div class="field-row">
      <label>Service<input type="text" value="${escapeAttr(row[0])}" data-price-row="${i}" data-price-cell="0"></label>
      <label>Price<input type="text" value="${escapeAttr(row[1])}" data-price-row="${i}" data-price-cell="1"></label>
      <button class="tiny-button danger" type="button" data-remove-price-row="${i}">Remove</button>
    </div>`).join("");
  editor.querySelectorAll("[data-price-cell]").forEach((input) => input.addEventListener("change", () => { group.rows[+input.dataset.priceRow][+input.dataset.priceCell] = input.value; saveDraft("Price updated."); }));
  editor.querySelectorAll("[data-remove-price-row]").forEach((b) => b.addEventListener("click", () => { group.rows.splice(+b.dataset.removePriceRow, 1); renderPriceEditor(group); renderPrices(); saveDraft("Row removed."); }));
}

function getSelectedPriceGroup() { return state.priceGroups.find((g) => g.id === selectedPriceGroupId) || state.priceGroups[0]; }

/* ---------------- Reviews ---------------- */
function bindReviews() {
  document.querySelector("[data-review-filter]")?.addEventListener("change", renderReviews);
  document.querySelector("[data-sync-google]")?.addEventListener("click", () => {
    state.reviews.unshift({ name: "Google review", initial: "G", rating: 5, treatment: "Imported from Google", source: "Google Business Profile", text: "Pending imported Google review. Approve before it appears publicly.", status: "pending", featured: false });
    renderReviews(); saveDraft("Google review imported as pending.");
  });
  document.querySelector("[data-add-review]")?.addEventListener("click", () => {
    state.reviews.unshift({ name: "New review", initial: "N", rating: 5, treatment: "Client feedback", source: "Manual entry", text: "Add the approved client quote here.", status: "pending", featured: false });
    renderReviews(); saveDraft("Review added as pending.");
  });
}

async function loadReviewsFromJson() {
  if (state.reviews.length) { renderReviews(); return; }
  try {
    const r = await fetch("../assets/data/reviews.json", { cache: "no-store" });
    if (!r.ok) throw new Error("unavailable");
    const data = await r.json();
    reviewsSummary = data.summary || reviewsSummary;
    state.reviews = (data.reviews || []).map((rev, i) => ({ ...rev, status: i < 10 ? "approved" : "pending", featured: i < 3 }));
    renderReviews(); updateMetrics();
  } catch { state.reviews = []; renderReviews(); }
}

// Preserve the Treatwell summary (rating/count/label) across publishes.
let reviewsSummary = { rating: "5.0", count: 47, label: "Treatwell reviews" };

/* admin reviews -> reviews.json shape (only APPROVED reviews go public, featured first) */
function toReviewsJson() {
  const approved = state.reviews.filter((r) => String(r.status || "").toLowerCase() === "approved");
  approved.sort((a, b) => (b.featured === true ? 1 : 0) - (a.featured === true ? 1 : 0));
  const reviews = approved.map((r) => ({
    name: r.name || "",
    initial: r.initial || (r.name || "?").charAt(0).toUpperCase(),
    rating: Number(r.rating) || 5,
    treatment: r.treatment || "",
    source: r.source || "Client feedback",
    text: r.text || ""
  }));
  return { summary: reviewsSummary, reviews };
}

async function publishReviews() {
  const cfg = getGh();
  if (!cfg.repo || !cfg.token) {
    toast("Add the website connection first (Settings).");
    goPanel("settings");
    return false;
  }
  const button = document.querySelector("[data-publish-reviews]");
  if (button) { button.disabled = true; button.textContent = "Publishing…"; }
  try {
    const branch = cfg.branch || "main";
    const content = b64(JSON.stringify(toReviewsJson(), null, 2) + "\n");
    let put;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let sha;
      const current = await ghRequest(
        REVIEWS_REPO_PATH + "?ref=" + encodeURIComponent(branch) + "&_=" + Date.now(),
        { method: "GET" }
      );
      if (current.ok) sha = (await current.json()).sha;
      else if (current.status !== 404) {
        const e = await current.json().catch(() => ({}));
        throw new Error(ghError(current.status, e.message));
      }
      const body = { message: "Update homepage reviews (via admin)", content, branch };
      if (sha) body.sha = sha;
      put = await ghRequest(REVIEWS_REPO_PATH, { method: "PUT", body: JSON.stringify(body) });
      if (put.ok) break;
      if (put.status === 409 && attempt < 2) { await new Promise((r) => setTimeout(r, 500)); continue; }
      const e = await put.json().catch(() => ({}));
      throw new Error(ghError(put.status, e.message));
    }
    toast("Published — your reviews will be live on the website in about a minute.");
    return true;
  } catch (err) {
    toast("Publish failed: " + err.message);
    return false;
  } finally {
    if (button) { button.disabled = false; button.textContent = "Publish reviews"; }
  }
}

function renderReviews() {
  const list = document.querySelector("[data-review-list]");
  const filter = document.querySelector("[data-review-filter]")?.value || "all";
  if (!list) return;
  const reviews = state.reviews.filter((r) => filter === "all" ? true : filter === "featured" ? r.featured : r.status === filter);
  list.innerHTML = reviews.map((review) => {
    const i = state.reviews.indexOf(review);
    return `
      <article class="admin-review-item">
        <div>
          <div class="review-meta"><strong>${escapeHtml(review.name || "Client")}</strong><span class="review-stars">${"★".repeat(+review.rating || 5)}</span><span class="status-pill">${escapeHtml(review.status || "approved")}</span>${review.featured ? '<span class="status-pill">featured</span>' : ""}</div>
          <p>${escapeHtml(review.text || "")}</p>
          <small>${escapeHtml(review.treatment || "Treatment")} · ${escapeHtml(review.source || "Client review")}</small>
        </div>
        <div class="review-actions">
          <button class="tiny-button" type="button" data-review-action="approved" data-review-index="${i}">Approve</button>
          <button class="tiny-button" type="button" data-review-action="featured" data-review-index="${i}">${review.featured ? "Unfeature" : "Feature"}</button>
          <button class="tiny-button" type="button" data-review-action="hidden" data-review-index="${i}">Hide</button>
          <button class="tiny-button" type="button" data-review-action="pending" data-review-index="${i}">Pending</button>
        </div>
      </article>`;
  }).join("") || '<article class="admin-review-item"><p>No reviews match this filter.</p></article>';
  list.querySelectorAll("[data-review-action]").forEach((b) => b.addEventListener("click", () => {
    const review = state.reviews[+b.dataset.reviewIndex]; if (!review) return;
    if (b.dataset.reviewAction === "featured") review.featured = !review.featured; else review.status = b.dataset.reviewAction;
    renderReviews(); saveDraft("Review updated.");
  }));
}

/* ---------------- Content ---------------- */
function bindContent() {
  document.querySelectorAll("[data-save-content]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-content-field]").forEach((f) => { state.content[f.dataset.contentField] = f.value; });
    saveDraft("Page content saved.");
  }));
}

/* ---------------- Settings ---------------- */
function bindSettings() {
  document.querySelector("[data-save-pass]")?.addEventListener("click", () => {
    const v = document.querySelector("[data-set-pass]")?.value.trim();
    if (!v) { toast("Enter a passcode first."); return; }
    localStorage.setItem(PASS_KEY, v); document.querySelector("[data-set-pass]").value = "";
    toast("Passcode updated.");
  });
  document.querySelector("[data-reset-admin]")?.addEventListener("click", () => {
    if (!confirm("Reset all admin drafts back to defaults? This clears your local changes.")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = loadDraft(); selectedOfferIndex = 0; selectedPriceGroupId = state.priceGroups[0]?.id;
    renderAll(); toast("Admin reset to defaults.");
  });
}

function bindGenericToasts() {
  document.querySelector("[data-demo-upload]")?.addEventListener("click", () => toast("Uploads will go through the CMS media library or a protected Worker upload endpoint."));
}

/* ---------------- Render + metrics ---------------- */
function renderAll() {
  renderOfferImageOptions();
  renderOffers();
  renderPrices();
  renderMedia();
  renderReviews();
  updateMetrics();
  updateLastSaved();
}

function renderOfferImageOptions() {
  const select = document.querySelector('[data-offer-field="image"]'); if (!select) return;
  select.innerHTML = imageOptions.map((img) => `<option value="${escapeHtml(img)}">${escapeHtml(img)}</option>`).join("");
}

function renderMedia() {
  const grid = document.querySelector("[data-media-grid]"); if (!grid) return;
  grid.innerHTML = imageOptions.map((img) => `
    <article class="media-item"><img src="../assets/images/${escapeAttr(img)}" alt="" loading="lazy" data-dim-on-error><div><strong>${escapeHtml(img)}</strong><small>Local asset</small></div></article>`).join("");
}

function updateMetrics() {
  setText('[data-metric="offers-published"]', state.offers.filter((o) => String(o.status || "").toLowerCase() !== "draft").length);
  setText('[data-metric="reviews-pending"]', state.reviews.filter((r) => r.status === "pending").length);

  const attention = document.querySelector("[data-attention]"); if (!attention) return;
  const items = [];
  const pending = state.reviews.filter((r) => r.status === "pending").length;
  if (pending) items.push(["Reviews to approve", `${pending} pending in the queue`]);
  const drafts = state.offers.filter((o) => String(o.status || "").toLowerCase() === "draft").length;
  if (drafts) items.push(["Offer drafts", `${drafts} not yet published`]);
  items.push(["Protect the admin", "Enable Cloudflare Access before sharing this URL"]);
  attention.innerHTML = items.map(([t, d]) => `<li><span>${escapeHtml(t)}</span><strong>${escapeHtml(d)}</strong></li>`).join("");
}

/* ---------------- Utils ---------------- */
function setText(sel, value) { document.querySelector(sel)?.replaceChildren(String(value)); }
function download(name, content, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = name; link.click();
  URL.revokeObjectURL(link.href);
}
function toast(message) {
  if (!toastRegion || !message) return;
  const node = document.createElement("div");
  node.className = "admin-toast-message"; node.textContent = message;
  toastRegion.appendChild(node);
  setTimeout(() => node.remove(), 3800);
}
function escapeHtml(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function escapeAttr(v) { return escapeHtml(v); }

/* =====================================================================
   PUBLISHING — offers created here go live on the homepage.
   The homepage reads assets/data/offers.json. Publishing commits that
   file to GitHub; Cloudflare then rebuilds the site (about a minute).
   ===================================================================== */
const OFFERS_JSON_URL = "../assets/data/offers.json";                    // what the homepage reads
const OFFERS_REPO_PATH = "lumi-derm-website/assets/data/offers.json";    // path inside the repo
const REVIEWS_REPO_PATH = "lumi-derm-website/assets/data/reviews.json";  // homepage reviews feed
const GH_KEY = "lumi-derm-gh-v1";

/* Accepts any of these and turns them into "owner/repo":
     DimaVasiliu/LumiDerm
     https://github.com/DimaVasiliu/LumiDerm
     https://github.com/DimaVasiliu/LumiDerm.git
     git@github.com:DimaVasiliu/LumiDerm.git                                        */
function normalizeRepo(value) {
  let v = String(value || "").trim();
  if (!v) return "";
  v = v.replace(/^git@github\.com:/i, "");
  v = v.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  v = v.replace(/^github\.com\//i, "");
  v = v.replace(/\.git$/i, "");
  v = v.replace(/^\/+|\/+$/g, "");
  const parts = v.split("/").filter(Boolean);
  return parts.length >= 2 ? parts[0] + "/" + parts[1] : "";
}

function getGh() {
  try {
    const cfg = JSON.parse(localStorage.getItem(GH_KEY) || "{}");
    cfg.repo = normalizeRepo(cfg.repo);
    return cfg;
  } catch { return {}; }
}
function setGh(cfg) { localStorage.setItem(GH_KEY, JSON.stringify(cfg)); }

/* admin shape -> offers.json shape (exactly what the homepage expects) */
function toOffersJson(offers) {
  return offers.map((o) => ({
    title: o.title || "",
    category: o.category || "",
    description: o.description || "",
    price: o.price || "",
    badge: o.badge || "",
    image: !o.image ? "" : (o.image.startsWith("assets/") ? o.image : "assets/images/" + o.image),
    service: o.service || "",
    status: String(o.status || "live").toLowerCase() === "draft" ? "draft" : "live",
    featured: o.featured === true,
    expires: o.expires || "",
    note: o.note || ""
  }));
}
/* offers.json shape -> admin shape */
function fromOffersJson(list) {
  return list.map((o) => ({
    title: o.title || "",
    category: o.category || "",
    description: o.description || "",
    price: o.price || "",
    badge: o.badge || "",
    image: String(o.image || "").replace(/^assets\/images\//, ""),
    service: o.service || "",
    status: String(o.status || "live").toLowerCase() === "draft" ? "Draft" : "Live",
    featured: o.featured === true,
    expires: o.expires || "",
    note: o.note || ""
  }));
}

/* Pull the offers that are actually on the website right now */
async function loadOffersFromSite(announce) {
  try {
    const res = await fetch(OFFERS_JSON_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("not found");
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.offers;
    if (!Array.isArray(list)) throw new Error("bad shape");
    state.offers = fromOffersJson(list);
    selectedOfferIndex = 0;
    renderOffers();
    saveDraft(announce ? "Loaded the offers currently on the website." : null);
    setPublishStatus("In sync with the website.");
  } catch (err) {
    if (announce) toast("Could not read the website's offers file.");
  }
}


/* GitHub errors -> plain English the user can act on */
function ghError(status, message) {
  if (status === 403 || /not accessible by personal access token/i.test(message || "")) {
    return "The token can read the repo but not write to it. On GitHub open your token and set " +
           "Permissions \u2192 Repository permissions \u2192 Contents = \u201cRead and write\u201d, then Update token. " +
           "(A classic token needs the \u201crepo\u201d scope.)";
  }
  if (status === 401) return "The token was rejected \u2014 it may be wrong or expired. Paste it again.";
  if (status === 404) return "Could not find offers.json in that repo/branch. Check the Repository and Branch fields.";
  if (status === 409) return "The file changed on GitHub since this page loaded. Click \u201cReload from website\u201d, redo your edit, then publish.";
  if (status === 422) return "GitHub rejected the update (422). Try \u201cReload from website\u201d, then publish again.";
  return message || ("GitHub said " + status + ".");
}

function setPublishStatus(message) {
  const el = document.querySelector("[data-publish-status]");
  if (el) el.textContent = message;
}

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

async function ghRequest(path, options) {
  const cfg = getGh();
  const res = await fetch("https://api.github.com/repos/" + cfg.repo + "/contents/" + path, {
    cache: "no-store", // always read the current sha, never a cached one
    ...options,
    headers: {
      Authorization: "Bearer " + cfg.token,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(options && options.headers)
    }
  });
  return res;
}

/* THE BUTTON: create offers -> click Publish -> live on the homepage */
async function publishOffers(options) {
  // NOTE: called both as a click handler (options = Event) and internally ({ silent: true })
  const silent = !!(options && options.silent === true);
  const cfg = getGh();
  if (!cfg.repo || !cfg.token) {
    toast("Add the website connection first (Settings).");
    goPanel("settings");
    return false;
  }
  const button = document.querySelector("[data-publish-offers]");
  if (button) { button.disabled = true; button.textContent = "Publishing…"; }
  setPublishStatus("Publishing to the website…");

  try {
    const branch = cfg.branch || "main";
    const content = b64(JSON.stringify({ offers: toOffersJson(state.offers) }, null, 2) + "\n");

    // Read the current sha and commit — retrying with a fresh sha on 409, which
    // happens when GitHub served a stale sha (cache) or the file moved on.
    let put;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // 1. current file sha (cache-busted so it's never stale)
      let sha;
      const current = await ghRequest(
        OFFERS_REPO_PATH + "?ref=" + encodeURIComponent(branch) + "&_=" + Date.now(),
        { method: "GET" }
      );
      if (current.ok) sha = (await current.json()).sha;
      else if (current.status !== 404) {
        const e = await current.json().catch(() => ({}));
        throw new Error(ghError(current.status, e.message));
      }

      // 2. commit the new offers
      const body = { message: "Update homepage offers (via admin)", content, branch };
      if (sha) body.sha = sha;

      put = await ghRequest(OFFERS_REPO_PATH, { method: "PUT", body: JSON.stringify(body) });
      if (put.ok) break;
      if (put.status === 409 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 500)); // brief pause, then re-read sha
        continue;
      }
      const e = await put.json().catch(() => ({}));
      throw new Error(ghError(put.status, e.message));
    }

    state.publishedAt = new Date().toISOString();
    saveDraft(null);
    setPublishStatus("Published. The website updates in about a minute.");
    if (!silent) toast("Published — your offers will be live on the website in about a minute.");
    return true;
  } catch (err) {
    setPublishStatus("Publish failed: " + err.message);
    toast("Publish failed: " + err.message);
    return false;
  } finally {
    if (button) { button.disabled = false; button.textContent = "Publish offers"; }
  }
}

/* ---------- Delete = actually delete (publishes the removal immediately) ---------- */
const STOCK_IMAGES = imageOptions.slice(); // ships with the site — never delete these files

async function deleteRepoImage(name) {
  const cfg = getGh();
  if (!cfg.repo || !cfg.token || !name) return;
  const branch = cfg.branch || "main";
  const path = IMAGES_REPO_DIR + name;
  const current = await ghRequest(path + "?ref=" + encodeURIComponent(branch), { method: "GET" });
  if (!current.ok) return; // not there, nothing to do
  const sha = (await current.json()).sha;
  await ghRequest(path, {
    method: "DELETE",
    body: JSON.stringify({ message: "Remove unused offer image " + name + " (via admin)", sha, branch })
  });
}

async function deleteOffer(index) {
  const offer = state.offers[index];
  if (!offer) return;
  const label = offer.title || "this offer";
  if (!confirm('Delete "' + label + '"?\n\nIt will be removed from the website straight away.')) return;

  const image = offer.image || "";

  state.offers.splice(index, 1);
  selectedOfferIndex = Math.max(0, Math.min(selectedOfferIndex, state.offers.length - 1));
  renderOffers();
  saveDraft(null);

  setPublishStatus("Removing \u201c" + label + "\u201d from the website\u2026");
  const ok = await publishOffers({ silent: true });
  if (!ok) {
    toast("Deleted here, but publishing failed \u2014 click \u201cPublish offers\u201d to retry.");
    return;
  }

  // Tidy up: delete the photo too, but only if it was uploaded for this offer
  // and no remaining offer still uses it.
  const stillUsed = state.offers.some((o) => (o.image || "") === image);
  const isUploaded = image && STOCK_IMAGES.indexOf(image) === -1;
  if (isUploaded && !stillUsed) {
    try { await deleteRepoImage(image); } catch (err) { /* non-fatal */ }
  }

  setPublishStatus("Deleted. The website updates in about a minute.");
  toast("\u201c" + label + "\u201d deleted and removed from the website.");
}

function bindPublishing() {
  document.querySelector("[data-publish-offers]")?.addEventListener("click", publishOffers);
  document.querySelector("[data-publish-reviews]")?.addEventListener("click", publishReviews);
  document.querySelector("[data-reload-offers]")?.addEventListener("click", () => {
    if (!confirm("Replace what's in the editor with the offers currently on the website?")) return;
    loadOffersFromSite(true);
  });

  // GitHub connection (one-time setup)
  const cfg = getGh();
  document.querySelectorAll("[data-gh-field]").forEach((f) => { f.value = cfg[f.dataset.ghField] || ""; });
  if (cfg.repo && cfg.token) setGhStatus("Connected to " + cfg.repo + " (" + (cfg.branch || "main") + ").");

  document.querySelector("[data-gh-save]")?.addEventListener("click", () => {
    const next = {};
    document.querySelectorAll("[data-gh-field]").forEach((f) => { next[f.dataset.ghField] = f.value.trim(); });
    if (!next.branch) next.branch = "main";
    setGh(next);
    setGhStatus("Saved. Use “Test connection” to check it works.");
    toast("Website connection saved.");
  });

  document.querySelector("[data-gh-test]")?.addEventListener("click", async () => {
    const c = getGh();
    if (!c.repo || !c.token) { setGhStatus("Fill in the repository and token first."); return; }
    setGhStatus("Testing…");
    try {
      const res = await ghRequest(OFFERS_REPO_PATH + "?ref=" + encodeURIComponent(c.branch || "main"), { method: "GET" });
      if (res.ok) setGhStatus("Connected and offers.json found. NOTE: this only proves the token can READ. If publishing fails with 403, set Contents = \u201cRead and write\u201d on the token.");
      else if (res.status === 404) setGhStatus("Connected to the repo, but offers.json was not found at " + OFFERS_REPO_PATH + ".");
      else if (res.status === 401 || res.status === 403) setGhStatus("The token was rejected. Check it has Contents: read & write on this repo.");
      else setGhStatus("GitHub said " + res.status + ".");
    } catch (err) {
      setGhStatus("Could not reach GitHub (" + err.message + "). If this says \u201cFailed to fetch\u201d, the site\u2019s security policy is blocking api.github.com \u2014 redeploy so the updated _headers file is live, then hard-refresh this page.");
    }
  });
}

function setGhStatus(message) {
  const el = document.querySelector("[data-gh-status]");
  if (el) el.textContent = message;
}

/* ---------- Image upload: photo -> repo -> website ---------- */
const IMAGES_REPO_DIR = "lumi-derm-website/assets/images/";

function safeImageName(original) {
  const dot = original.lastIndexOf(".");
  let base = (dot > 0 ? original.slice(0, dot) : original).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  let ext = (dot > 0 ? original.slice(dot + 1) : "jpg").toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "avif"].indexOf(ext) === -1) ext = "jpg";
  if (!base) base = "photo";
  // trim again after truncating so we never end up with a double dash
  base = base.slice(0, 40).replace(/-+$/, "");
  // timestamp keeps it unique so nothing is ever overwritten
  return "offer-" + base + "-" + Date.now().toString(36) + "." + ext;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1)); // strip the data: prefix
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

async function uploadImage(file) {
  const cfg = getGh();
  if (!cfg.repo || !cfg.token) {
    toast("Add the website connection first (Settings).");
    goPanel("settings");
    return null;
  }
  if (!/^image\//.test(file.type)) throw new Error("That file is not an image.");
  if (file.size > 3 * 1024 * 1024) throw new Error("That image is larger than 3MB. Please use a smaller one.");

  const branch = cfg.branch || "main";
  const name = safeImageName(file.name);
  const path = IMAGES_REPO_DIR + name;
  const content = await fileToBase64(file);

  const put = await ghRequest(path, {
    method: "PUT",
    body: JSON.stringify({ message: "Add offer image " + name + " (via admin)", content, branch })
  });
  if (!put.ok) {
    const e = await put.json().catch(() => ({}));
    throw new Error(ghError(put.status, e.message));
  }
  return name;
}

function bindImageUpload() {
  const input = document.querySelector("[data-offer-image-upload]");
  const status = document.querySelector("[data-image-upload-status]");
  if (!input) return;

  input.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (status) status.textContent = "Uploading " + file.name + "…";

    try {
      const name = await uploadImage(file);
      if (!name) { if (status) status.textContent = ""; event.target.value = ""; return; }

      // make it available in the dropdown and select it
      if (imageOptions.indexOf(name) === -1) imageOptions.unshift(name);
      renderOfferImageOptions();
      const select = document.querySelector('[data-offer-field="image"]');
      if (select) select.value = name;

      const offer = state.offers[selectedOfferIndex];
      if (offer) { offer.image = name; saveDraft(null); }
      renderOfferPreview();
      renderMedia();

      if (status) status.textContent = "Uploaded and selected. The photo appears on the website about a minute after you publish.";
      toast("Photo uploaded to the website.");
    } catch (err) {
      if (status) status.textContent = "Upload failed: " + err.message;
      toast("Upload failed: " + err.message);
    }
    event.target.value = "";
  });
}

/* CSP-safe image error handling (replaces inline onerror attributes).
   Broken thumbnails hide/dim gracefully without inline scripts. */
document.addEventListener(
  "error",
  function (e) {
    var t = e.target;
    if (!t || t.tagName !== "IMG") return;
    if (t.hasAttribute("data-hide-on-error")) {
      t.style.display = "none";
    } else if (t.hasAttribute("data-dim-on-error")) {
      var item = t.closest(".media-item");
      if (item) item.style.opacity = "0.4";
    }
  },
  true // capture phase — image 'error' events don't bubble
);
