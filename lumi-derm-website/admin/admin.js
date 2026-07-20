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

// Prices are now data-driven from assets/data/prices.json (loaded at runtime by
// loadPricesFromJson). The treatments page is regenerated from that file on publish.

const panelTitles = { dashboard: "Overview", guide: "Guide & help", offers: "Offers", prices: "Prices", sender: "Send email", subscribers: "Subscribers", reviews: "Reviews", media: "Media", content: "Pages", clients: "Treatwell", settings: "Settings" };

let state = loadDraft();
let selectedOfferIndex = 0;
let selectedTx = { gi: 0, ti: 0 }; // selected treatment in the Prices editor (group index, treatment index)

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
  loadPricesFromJson();
  loadContentFromJson();
  // First run (no local draft yet) -> start from the offers actually on the website.
  if (!localStorage.getItem(STORAGE_KEY)) loadOffersFromSite(false);
}

/* ---------------- Storage ---------------- */
function loadDraft() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      offers: Array.isArray(s.offers) ? s.offers : structuredClone(defaultOffers),
      prices: s.prices && Array.isArray(s.prices.groups) ? s.prices : { groups: [] },
      reviews: Array.isArray(s.reviews) ? s.reviews : [],
      content: s.content || {},
      campaigns: Array.isArray(s.campaigns) ? s.campaigns : [],
      savedAt: s.savedAt || null
    };
  } catch {
    return { offers: structuredClone(defaultOffers), prices: { groups: [] }, reviews: [], content: {}, campaigns: [], savedAt: null };
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
      ["offers", "reviews", "campaigns"].forEach((k) => { if (!Array.isArray(state[k])) state[k] = []; });
      if (!state.prices || !Array.isArray(state.prices.groups)) state.prices = { groups: [] };
      selectedOfferIndex = 0; selectedTx = { gi: 0, ti: 0 };
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
    <tr class="${i === selectedOfferIndex ? "is-selected" : ""}" draggable="true" data-offer-row="${i}">
      <td><span class="drag-grip" title="Drag to reorder" aria-hidden="true">⋮⋮</span><strong>${escapeHtml(o.title)}</strong><span>${escapeHtml(o.category)}</span></td>
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
  bindOfferDrag(table);
  populateOfferEditor();
}

// Drag-and-drop reordering (arrow buttons remain as a keyboard-friendly fallback).
let offerDragFrom = null;
function bindOfferDrag(table) {
  table.querySelectorAll("[data-offer-row]").forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      offerDragFrom = +row.dataset.offerRow;
      row.classList.add("dragging");
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(offerDragFrom)); } catch (_) { /* IE */ } }
    });
    row.addEventListener("dragend", () => {
      offerDragFrom = null;
      table.querySelectorAll(".dragging, .drag-over").forEach((el) => el.classList.remove("dragging", "drag-over"));
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      if (!row.classList.contains("dragging")) row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      reorderOffer(offerDragFrom, +row.dataset.offerRow);
    });
  });
}

function reorderOffer(from, to) {
  if (from == null || to == null || isNaN(from) || isNaN(to) || from === to) return;
  if (from < 0 || to < 0 || from >= state.offers.length || to >= state.offers.length) return;
  const moved = state.offers.splice(from, 1)[0];
  if (!moved) return;
  state.offers.splice(to, 0, moved);
  selectedOfferIndex = to;
  renderOffers();
  saveDraft("Order updated.");
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

/* ---------------- Prices (treatments page) ----------------
   The treatments page (pages/services.html) is generated from
   assets/data/prices.json between the PRICES markers. Iulia edits price
   values, instalment notes and the "from £X" headline here; the
   descriptions and table layout are fixed. Publishing rewrites both
   prices.json and the marked section of services.html. */
const PRICES_JSON_URL = "../assets/data/prices.json";

function bindPrices() {
  document.querySelector("[data-reload-prices]")?.addEventListener("click", () => {
    if (!confirm("Replace the prices in the editor with the ones currently on the website?")) return;
    loadPricesFromJson(true, true);
  });
}

async function loadPricesFromJson(announce, force) {
  if (!force && state.prices && Array.isArray(state.prices.groups) && state.prices.groups.length) {
    renderPrices(); return;
  }
  try {
    const r = await fetch(PRICES_JSON_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("unavailable");
    const data = await r.json();
    state.prices = { groups: Array.isArray(data.groups) ? data.groups : [] };
    selectedTx = { gi: 0, ti: 0 };
    renderPrices();
    saveDraft(announce ? "Loaded the prices currently on the website." : null);
    setPricesStatus("In sync with the website.");
  } catch {
    if (announce) toast("Could not read the website's prices file.");
    renderPrices();
  }
}

function setPricesStatus(message) {
  const el = document.querySelector("[data-prices-status]"); if (el) el.textContent = message;
}

// Strip tags for plain-text contexts (e.g. building nav labels). Keeps entities.
function stripTags(v) { return String(v == null ? "" : v).replace(/<[^>]*>/g, ""); }
// Decode HTML entities to plain text for editing inside <input> values.
function decodeHtml(v) { const el = document.createElement("textarea"); el.innerHTML = String(v == null ? "" : v); return el.value; }

function currentTx() {
  const g = state.prices && state.prices.groups ? state.prices.groups[selectedTx.gi] : null;
  return g && g.treatments ? g.treatments[selectedTx.ti] : null;
}

function renderPrices() {
  const nav = document.querySelector("[data-price-nav]");
  const editor = document.querySelector("[data-price-editor]");
  if (!nav || !editor) return;
  const groups = (state.prices && state.prices.groups) || [];
  if (!groups.length) {
    nav.innerHTML = "";
    editor.innerHTML = '<p class="admin-hint">Loading the treatment menu&hellip; if this stays empty, click &ldquo;Reload from website&rdquo;.</p>';
    return;
  }
  nav.innerHTML = groups.map((g, gi) => `
    <div class="price-nav-group">
      <p class="price-nav-title">${stripTags(g.title)}</p>
      ${(g.treatments || []).map((t, ti) => `
        <button type="button" class="price-nav-item ${gi === selectedTx.gi && ti === selectedTx.ti ? "is-selected" : ""}" data-price-pick="${gi}:${ti}">
          <span>${stripTags(t.title)}</span><small>${escapeHtml(decodeHtml(t.headline || ""))}</small>
        </button>`).join("")}
    </div>`).join("");
  nav.querySelectorAll("[data-price-pick]").forEach((b) => b.addEventListener("click", () => {
    const parts = b.dataset.pricePick.split(":").map(Number);
    selectedTx = { gi: parts[0], ti: parts[1] }; renderPrices();
  }));
  renderPriceEditor(editor);
}

function renderPriceEditor(editor) {
  const t = currentTx();
  if (!t) { editor.innerHTML = '<p class="admin-hint">Pick a treatment on the left to edit its prices.</p>'; return; }
  const groupTitle = stripTags(state.prices.groups[selectedTx.gi].title);

  let html = `
    <div class="price-editor-head">
      <p class="admin-eyebrow">${groupTitle}</p>
      <h3>${stripTags(t.title)}</h3>
      <p class="admin-hint">Change the prices, notes and the headline below. The description and table layout stay the same.</p>
    </div>
    <label class="price-headline">Headline price <small>the &ldquo;from &pound;&hellip;&rdquo; shown on the card</small>
      <input type="text" value="${escapeAttr(decodeHtml(t.headline || ""))}" data-tx-headline>
    </label>`;

  (t.detail || []).forEach((b, bi) => {
    if (b.type === "subhead") {
      html += `<p class="price-block-sub">${stripTags(b.text)}</p>`;
    } else if (b.type === "table") {
      const cols = b.columns || [];
      html += `<div class="price-table-edit"><table><thead><tr><th>Area</th>${cols.slice(1).map((c) => `<th>${stripTags(c)}</th>`).join("")}</tr></thead><tbody>`;
      (b.rows || []).forEach((row, ri) => {
        html += `<tr><th scope="row">${stripTags(row[0])}</th>`;
        for (let ci = 1; ci < row.length; ci += 1) {
          html += `<td><input type="text" value="${escapeAttr(decodeHtml(row[ci]))}" data-tx-cell="${bi}:${ri}:${ci}" aria-label="${escapeAttr(stripTags(row[0]) + " " + stripTags(cols[ci] || ""))}"></td>`;
        }
        html += `</tr>`;
      });
      html += `</tbody></table></div>`;
    } else if (b.type === "pricelist") {
      html += `<div class="price-list-edit">`;
      (b.rows || []).forEach((row, ri) => {
        html += `
          <div class="price-list-row">
            <span class="price-list-name">${row.name || ""}</span>
            <input type="text" class="price-list-cost" value="${escapeAttr(decodeHtml(row.cost || ""))}" data-tx-cost="${bi}:${ri}" aria-label="Price">
            <input type="text" class="price-list-small" value="${escapeAttr(decodeHtml(row.costSmall || ""))}" data-tx-costsmall="${bi}:${ri}" placeholder="note, e.g. pay in 2 instalments" aria-label="Instalment note">
          </div>`;
      });
      html += `</div>`;
    } else if (b.type === "pill") {
      html += `<label class="price-pill-edit">Highlight line <small>e.g. package discounts, trial price</small><input type="text" value="${escapeAttr(decodeHtml(b.text || ""))}" data-tx-pill="${bi}"></label>`;
    } else if (b.type === "note") {
      html += `<label class="price-note-edit">Note<input type="text" value="${escapeAttr(decodeHtml(b.text || ""))}" data-tx-note="${bi}"></label>`;
    }
    // b.type === "p" (description prose) is intentionally not editable here.
  });

  editor.innerHTML = html;

  editor.querySelector("[data-tx-headline]")?.addEventListener("change", (e) => {
    t.headline = escapeHtml(e.target.value.trim()); saveDraft("Headline updated."); updateNavHeadline();
  });
  editor.querySelectorAll("[data-tx-cell]").forEach((inp) => inp.addEventListener("change", () => {
    const p = inp.dataset.txCell.split(":").map(Number);
    t.detail[p[0]].rows[p[1]][p[2]] = escapeHtml(inp.value.trim()); saveDraft("Price updated.");
  }));
  editor.querySelectorAll("[data-tx-cost]").forEach((inp) => inp.addEventListener("change", () => {
    const p = inp.dataset.txCost.split(":").map(Number);
    t.detail[p[0]].rows[p[1]].cost = escapeHtml(inp.value.trim()); saveDraft("Price updated.");
  }));
  editor.querySelectorAll("[data-tx-costsmall]").forEach((inp) => inp.addEventListener("change", () => {
    const p = inp.dataset.txCostsmall.split(":").map(Number);
    t.detail[p[0]].rows[p[1]].costSmall = escapeHtml(inp.value.trim()); saveDraft("Note updated.");
  }));
  editor.querySelectorAll("[data-tx-pill]").forEach((inp) => inp.addEventListener("change", () => {
    t.detail[+inp.dataset.txPill].text = escapeHtml(inp.value.trim()); saveDraft("Highlight updated.");
  }));
  editor.querySelectorAll("[data-tx-note]").forEach((inp) => inp.addEventListener("change", () => {
    t.detail[+inp.dataset.txNote].text = escapeHtml(inp.value.trim()); saveDraft("Note updated.");
  }));
}

// Update just the selected nav item's headline label (no full re-render, keeps scroll).
function updateNavHeadline() {
  const t = currentTx(); if (!t) return;
  const small = document.querySelector(`[data-price-pick="${selectedTx.gi}:${selectedTx.ti}"] small`);
  if (small) small.textContent = decodeHtml(t.headline || "");
}

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

/* ---------------- Pages (hero copy + contact details) ----------------
   Homepage hero is rendered from content.json between the HERO markers in
   index.html. Contact details are stored in content.json and, on publish,
   replaced (exact-string) everywhere they appear across the site. */
const CONTENT_JSON_URL = "../assets/data/content.json";
const CONTACT_KEYS = ["phone", "email", "address", "instagramUrl", "instagramHandle", "facebookUrl", "facebookHandle"];

// Current live values on the site (used as fallback if content.json is missing).
const DEFAULT_CONTENT = {
  hero: {
    eyebrow: "Lumi Derm Aesthetics &middot; London Docklands",
    title: "Skin confidence,<br>made personal.",
    lead: "Advanced skin, laser and body treatments designed around your goals, your skin and your lifestyle &mdash; delivered with calm, expert-led care."
  },
  contact: {
    phone: "07832839298",
    email: "info@lumidermaesthetics.co.uk",
    address: "Unit 41 Skylines Village, Limeharbour, London, E14 9TS",
    instagramUrl: "https://www.instagram.com/lumi.derm.aesthetic/",
    instagramHandle: "@lumi.derm.aesthetic",
    facebookUrl: "https://www.facebook.com/LumiDerm",
    facebookHandle: "LumiDerm"
  }
};

function contentReady() { return state.content && state.content.hero && state.content.contact; }

function bindContent() {
  document.querySelector("[data-reload-content]")?.addEventListener("click", () => {
    if (!confirm("Replace the text in the editor with what's currently on the website?")) return;
    loadContentFromJson(true, true);
  });
  document.querySelectorAll("[data-content-hero]").forEach((f) => f.addEventListener("change", () => {
    if (!state.content.hero) state.content.hero = {};
    const key = f.dataset.contentHero;
    state.content.hero[key] = key === "title"
      ? escapeHtml(f.value).replace(/\n+/g, "<br>")
      : escapeHtml(f.value.trim());
    saveDraft("Hero text updated.");
  }));
  document.querySelectorAll("[data-content-contact]").forEach((f) => f.addEventListener("change", () => {
    if (!state.content.contact) state.content.contact = {};
    state.content.contact[f.dataset.contentContact] = escapeHtml(f.value.trim());
    saveDraft("Contact detail updated.");
  }));
}

async function loadContentFromJson(announce, force) {
  try {
    const r = await fetch(CONTENT_JSON_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      const live = { hero: data.hero || {}, contact: data.contact || {} };
      if (force || !contentReady()) {
        state.content = structuredClone(live);
        saveDraft(announce ? "Loaded the text currently on the website." : null);
      }
    } else if (force || !contentReady()) {
      state.content = structuredClone(DEFAULT_CONTENT);
      saveDraft(null);
    }
  } catch {
    if (!contentReady()) state.content = structuredClone(DEFAULT_CONTENT);
    if (announce) toast("Could not read the website's text file.");
  }
  renderContent();
}

function renderContent() {
  const c = state.content || {};
  const hero = c.hero || {}, contact = c.contact || {};
  const setVal = (sel, val) => { const el = document.querySelector(sel); if (el) el.value = val; };
  setVal('[data-content-hero="eyebrow"]', decodeHtml(hero.eyebrow || ""));
  setVal('[data-content-hero="title"]', decodeHtml(String(hero.title || "").replace(/<br\s*\/?>/gi, "\n")));
  setVal('[data-content-hero="lead"]', decodeHtml(hero.lead || ""));
  CONTACT_KEYS.forEach((k) => setVal(`[data-content-contact="${k}"]`, decodeHtml(contact[k] || "")));
}

function setContentStatus(message) {
  const el = document.querySelector("[data-content-status]"); if (el) el.textContent = message;
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
    state = loadDraft(); selectedOfferIndex = 0; selectedTx = { gi: 0, ti: 0 };
    renderAll(); loadPricesFromJson(false, true); loadContentFromJson(false, true); toast("Admin reset to defaults.");
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
  renderContent();
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
const PRICES_REPO_PATH = "lumi-derm-website/assets/data/prices.json";    // treatments-page prices data
const SERVICES_REPO_PATH = "lumi-derm-website/pages/services.html";      // treatments page (rendered from prices.json)
const PRICES_MARKERS = /(<!-- PRICES:START[\s\S]*?-->)[\s\S]*?(<!-- PRICES:END -->)/; // section rewritten on publish
const CONTENT_REPO_PATH = "lumi-derm-website/assets/data/content.json";  // hero copy + contact details
const HERO_MARKERS = /(<!-- HERO:START[\s\S]*?-->)[\s\S]*?(<!-- HERO:END -->)/; // homepage hero block
// Every page that may show contact details; index.html also carries the hero.
const SITE_PAGE_PATHS = [
  "lumi-derm-website/index.html",
  "lumi-derm-website/pages/about.html",
  "lumi-derm-website/pages/booking.html",
  "lumi-derm-website/pages/contact.html",
  "lumi-derm-website/pages/cookies.html",
  "lumi-derm-website/pages/gallery.html",
  "lumi-derm-website/pages/policies.html",
  "lumi-derm-website/pages/privacy.html",
  "lumi-derm-website/pages/services.html",
  "lumi-derm-website/pages/terms.html",
  "lumi-derm-website/pages/treatment.html"
];
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
    alt: o.alt || "",
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
    alt: o.alt || "",
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

/* ---------- Publish prices: rewrite prices.json AND the treatments page ---------- */
function decodeB64(str) {
  const bin = atob(String(str || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Commit a whole file (create or update), retrying with a fresh sha on 409.
async function putFileWithRetry(repoPath, contentB64, message, branch) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let sha;
    const current = await ghRequest(repoPath + "?ref=" + encodeURIComponent(branch) + "&_=" + Date.now(), { method: "GET" });
    if (current.ok) sha = (await current.json()).sha;
    else if (current.status !== 404) { const e = await current.json().catch(() => ({})); throw new Error(ghError(current.status, e.message)); }
    const body = { message, content: contentB64, branch };
    if (sha) body.sha = sha;
    const put = await ghRequest(repoPath, { method: "PUT", body: JSON.stringify(body) });
    if (put.ok) return;
    if (put.status === 409 && attempt < 2) { await new Promise((r) => setTimeout(r, 500)); continue; }
    const e = await put.json().catch(() => ({}));
    throw new Error(ghError(put.status, e.message));
  }
}

// Read services.html, replace the marked section with freshly rendered prices, commit.
async function publishServicesHtml(branch, renderedSection) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await ghRequest(SERVICES_REPO_PATH + "?ref=" + encodeURIComponent(branch) + "&_=" + Date.now(), { method: "GET" });
    if (!current.ok) { const e = await current.json().catch(() => ({})); throw new Error(ghError(current.status, e.message)); }
    const meta = await current.json();
    const html = decodeB64(meta.content);
    if (!PRICES_MARKERS.test(html)) throw new Error("The price markers weren’t found in services.html — ask Dima to check the page.");
    const next = html.replace(PRICES_MARKERS, "$1\n\n" + renderedSection + "\n\n          $2");
    const body = { message: "Update treatment prices on the treatments page (via admin)", content: b64(next), sha: meta.sha, branch };
    const put = await ghRequest(SERVICES_REPO_PATH, { method: "PUT", body: JSON.stringify(body) });
    if (put.ok) return;
    if (put.status === 409 && attempt < 2) { await new Promise((r) => setTimeout(r, 500)); continue; }
    const e = await put.json().catch(() => ({}));
    throw new Error(ghError(put.status, e.message));
  }
}

async function publishPrices() {
  const cfg = getGh();
  if (!cfg.repo || !cfg.token) { toast("Add the website connection first (Settings)."); goPanel("settings"); return false; }
  if (typeof window.renderTreatmentLibrary !== "function") { toast("Price template didn’t load — hard-refresh the admin and try again."); return false; }
  if (!state.prices || !(state.prices.groups || []).length) { toast("No prices loaded yet — click “Reload from website” first."); return false; }

  const button = document.querySelector("[data-publish-prices]");
  if (button) { button.disabled = true; button.textContent = "Publishing…"; }
  setPricesStatus("Publishing to the treatments page…");
  try {
    const branch = cfg.branch || "main";
    // 1) the data file (source of truth the admin reloads from)
    const json = b64(JSON.stringify(state.prices, null, 2) + "\n");
    await putFileWithRetry(PRICES_REPO_PATH, json, "Update prices data (via admin)", branch);
    // 2) the rendered treatments page (what visitors + Google see)
    const rendered = window.renderTreatmentLibrary(state.prices);
    await publishServicesHtml(branch, rendered);

    state.publishedAt = new Date().toISOString();
    saveDraft(null);
    setPricesStatus("Published. The treatments page updates in about a minute.");
    toast("Published — your new prices will be live on the treatments page in about a minute.");
    return true;
  } catch (err) {
    setPricesStatus("Publish failed: " + err.message);
    toast("Publish failed: " + err.message);
    return false;
  } finally {
    if (button) { button.disabled = false; button.textContent = "Publish prices"; }
  }
}

/* ---------- Publish page text: hero markers (home) + site-wide contact details ---------- */
function contactOps(oldC, newC) {
  const ops = [];
  const plain = (o, n) => { if (o && n && o !== n) ops.push([o, n]); };
  plain(oldC.phone, newC.phone);
  plain(oldC.email, newC.email);
  plain(oldC.address, newC.address);
  plain(oldC.instagramUrl, newC.instagramUrl);
  plain(oldC.facebookUrl, newC.facebookUrl);
  // Handles are short; anchor them between > and < so only the visible link text is touched.
  const anchored = (o, n) => { if (o && n && o !== n) ops.push([">" + o + "<", ">" + n + "<"]); };
  anchored(oldC.instagramHandle, newC.instagramHandle);
  anchored(oldC.facebookHandle, newC.facebookHandle);
  return ops;
}
function applyOps(text, ops) {
  let out = text;
  ops.forEach((pair) => { out = out.split(pair[0]).join(pair[1]); });
  return out;
}

// GET (fresh) -> transform -> PUT only if changed, retry on 409. Returns true if committed.
async function commitTransformedFile(repoPath, branch, transform, message) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await ghRequest(repoPath + "?ref=" + encodeURIComponent(branch) + "&_=" + Date.now(), { method: "GET" });
    if (!current.ok) { const e = await current.json().catch(() => ({})); throw new Error(ghError(current.status, e.message)); }
    const meta = await current.json();
    const before = decodeB64(meta.content);
    const after = transform(before);
    if (after === before) return false;
    const body = { message, content: b64(after), sha: meta.sha, branch };
    const put = await ghRequest(repoPath, { method: "PUT", body: JSON.stringify(body) });
    if (put.ok) return true;
    if (put.status === 409 && attempt < 2) { await new Promise((r) => setTimeout(r, 500)); continue; }
    const e = await put.json().catch(() => ({}));
    throw new Error(ghError(put.status, e.message));
  }
  return false;
}

async function publishContent() {
  const cfg = getGh();
  if (!cfg.repo || !cfg.token) { toast("Add the website connection first (Settings)."); goPanel("settings"); return false; }
  if (typeof window.renderHero !== "function") { toast("Page template didn’t load — hard-refresh the admin and try again."); return false; }
  if (!contentReady()) { toast("No page text loaded yet — click “Reload from website” first."); return false; }

  const button = document.querySelector("[data-publish-content]");
  if (button) { button.disabled = true; button.textContent = "Publishing…"; }
  setContentStatus("Publishing page text…");
  try {
    const branch = cfg.branch || "main";

    // 1) authoritative "old" values + sha from the live content.json
    let oldContent = structuredClone(DEFAULT_CONTENT), sha;
    const cur = await ghRequest(CONTENT_REPO_PATH + "?ref=" + encodeURIComponent(branch) + "&_=" + Date.now(), { method: "GET" });
    if (cur.ok) {
      const m = await cur.json(); sha = m.sha;
      try { const parsed = JSON.parse(decodeB64(m.content)); oldContent = { hero: parsed.hero || {}, contact: parsed.contact || {} }; } catch { /* keep default */ }
    } else if (cur.status !== 404) { const e = await cur.json().catch(() => ({})); throw new Error(ghError(cur.status, e.message)); }

    const heroChanged = JSON.stringify(oldContent.hero || {}) !== JSON.stringify(state.content.hero || {});
    const ops = contactOps(oldContent.contact || {}, state.content.contact || {});
    if (!heroChanged && !ops.length) {
      setContentStatus("Nothing to publish — no changes since last time.");
      toast("No page-text changes to publish.");
      return true;
    }

    // 2) commit the data file (source of truth the admin reloads from)
    const jsonBody = { message: "Update page text data (via admin)", content: b64(JSON.stringify(state.content, null, 2) + "\n"), branch };
    if (sha) jsonBody.sha = sha;
    const putJson = await ghRequest(CONTENT_REPO_PATH, { method: "PUT", body: JSON.stringify(jsonBody) });
    if (!putJson.ok) { const e = await putJson.json().catch(() => ({})); throw new Error(ghError(putJson.status, e.message)); }

    // 3) rewrite each page: index.html gets hero (if changed) + contact; the rest get contact only
    const heroHtml = window.renderHero(state.content.hero || {});
    let changed = 0;
    for (const repoPath of SITE_PAGE_PATHS) {
      const isHome = repoPath.endsWith("/index.html");
      const transform = (html) => {
        let out = html;
        if (isHome && heroChanged && HERO_MARKERS.test(out)) out = out.replace(HERO_MARKERS, "$1\n              " + heroHtml + "\n              $2");
        if (ops.length) out = applyOps(out, ops);
        return out;
      };
      if (await commitTransformedFile(repoPath, branch, transform, "Update page text (via admin)")) changed += 1;
    }

    state.publishedAt = new Date().toISOString();
    saveDraft(null);
    setContentStatus("Published. The website updates in about a minute (" + changed + " page" + (changed === 1 ? "" : "s") + " updated).");
    toast("Published — your page text will be live in about a minute.");
    return true;
  } catch (err) {
    setContentStatus("Publish failed: " + err.message);
    toast("Publish failed: " + err.message);
    return false;
  } finally {
    if (button) { button.disabled = false; button.textContent = "Publish page text"; }
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
  document.querySelector("[data-publish-prices]")?.addEventListener("click", publishPrices);
  document.querySelector("[data-publish-content]")?.addEventListener("click", publishContent);
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
