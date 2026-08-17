/* Lumi Derm Admin — client-side website workspace.
   Website content persists in localStorage as drafts. Treatwell remains the
   external system of record for bookings, payments and client information. */

const STORAGE_KEY = "lumi-derm-admin-draft-v2";
const VERSION_KEY = "lumi-derm-admin-versions-v1";
const PASS_KEY = "lumi-derm-admin-pass";
const UNLOCK_KEY = "lumi-derm-admin-unlocked";
const DEFAULT_PASS = "lumiderm";

const imageOptions = [
  "offer-laser-treatments-cynosure.webp", "offer-electrolysis-apilus.webp",
  "offer-endospheres-therapy.webp", "offer-prp-treatment.webp",
  "offer-skin-boosters.webp", "offer-lip-boosters.webp", "offer-mesotherapy.webp",
  "offer-facials.webp", "offer-microneedling.webp", "offer-peels.webp",
  "offer-exosomes.webp", "offer-lashes-brows.webp", "offer-hair-loss-treatment.webp",
  "practitioner-professional-portrait.webp", "about-lumi-derm-studio.webp",
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

const panelTitles = { dashboard: "Overview", guide: "Guide & help", offers: "Offers", prices: "Prices", treatments: "Treatment cards", sender: "Send email", subscribers: "Subscribers", reviews: "Reviews", media: "Media", content: "Pages", faq: "FAQ", birthday: "Birthday", clients: "Treatwell", settings: "Settings" };

let state = loadDraft();
let selectedOfferIndex = 0;
let selectedTx = { gi: 0, ti: 0 }; // selected treatment in the Prices editor (group index, treatment index)
let undoStack = [];
let adminRole = "owner";
let roleLoaded = false;
let roleToastShown = false;

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
  // Purge any GitHub token left in this browser by the old client-side publisher.
  // Publishing is now server-side (Cloudflare secret); the browser holds nothing.
  try { localStorage.removeItem("lumi-derm-gh-v1"); } catch (e) { /* ignore */ }
  loadRole(); // learn role immediately after unlock and apply it globally
  bindNavigation();
  bindTopActions();
  bindOffers();
  bindPrices();
  bindTreatmentCards();
  bindTreatmentAddForm();
  bindReviews();
  bindContent();
  bindFaq();
  bindBirthdayVouchers();
  bindSettings();
  bindGenericToasts();
  bindPublishing();
  bindImageUpload();
  bindMedia();
  renderAll();
  loadReviews();
  loadPricesFromJson();
  loadContentFromJson();
  loadMedia();
  loadBirthdays();
  loadReviewSubmissions();
  loadAlerts();
  document.querySelector("[data-alerts-reload]")?.addEventListener("click", loadAlerts);
  initCollapsibles();
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
  const before = localStorage.getItem(STORAGE_KEY);
  const next = JSON.stringify(state);
  if (before && before !== next) {
    undoStack.push(before);
    if (undoStack.length > 12) undoStack.shift();
  }
  state.savedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateLastSaved();
  updateMetrics();
  if (message) toast(message);
}

function draftVersions() {
  try {
    const rows = JSON.parse(localStorage.getItem(VERSION_KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

function recordDraftVersion(kind, label, payload) {
  // Local safety net (works offline, this browser only).
  try {
    const rows = draftVersions();
    rows.unshift({
      id: "ver_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
      kind,
      label,
      created_at: new Date().toISOString(),
      payload: structuredClone(payload),
    });
    localStorage.setItem(VERSION_KEY, JSON.stringify(rows.slice(0, 40)));
  } catch { /* local snapshots are a safety net, not critical */ }
  // Durable server copy (survives a new laptop/browser). Fire-and-forget.
  saveServerRevision(kind, label, payload);
}

function saveServerRevision(kind, label, payload) {
  fetch("/admin/api/revisions", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, label, payload }),
  }).then(() => renderVersionHistory()).catch(() => { /* offline: local copy still exists */ });
}

// Server-first (durable, any device). Falls back to the local browser copy
// if the server can't be reached or has nothing yet.
async function renderVersionHistory() {
  const box = document.querySelector("[data-version-history]");
  if (!box) return;
  try {
    const res = await fetch("/admin/api/revisions?limit=15", { cache: "no-store", credentials: "same-origin" });
    const data = await ldReadJson(res);
    const rows = data.revisions || [];
    if (!rows.length) { renderLocalVersionHistory(box); return; }
    box.innerHTML = rows.map((row) => `
      <article class="version-item">
        <div><strong>${escapeHtml(versionKind(row.kind))}</strong><span>${escapeHtml(row.label || "Snapshot")} · ${escapeHtml(auditWhen(row.created_at))}${row.actor ? " · " + escapeHtml(row.actor) : ""}</span></div>
        <button class="tiny-button" type="button" data-version-restore="srv:${escapeAttr(row.id)}">Restore</button>
      </article>`).join("");
    box.querySelectorAll("[data-version-restore]").forEach((btn) => btn.addEventListener("click", () => restoreDraftVersion(btn.dataset.versionRestore)));
  } catch {
    renderLocalVersionHistory(box);
  }
}

function renderLocalVersionHistory(box) {
  const rows = draftVersions();
  if (!rows.length) {
    box.innerHTML = '<p class="admin-help">No versions saved yet. Publishing, reloading or editing reviews creates a snapshot automatically.</p>';
    return;
  }
  box.innerHTML = rows.slice(0, 12).map((row) => `
    <article class="version-item">
      <div><strong>${escapeHtml(versionKind(row.kind))}</strong><span>${escapeHtml(row.label || "Snapshot")} · ${escapeHtml(auditWhen(row.created_at))} · this browser</span></div>
      <button class="tiny-button" type="button" data-version-restore="loc:${escapeAttr(row.id)}">Restore</button>
    </article>`).join("");
  box.querySelectorAll("[data-version-restore]").forEach((btn) => btn.addEventListener("click", () => restoreDraftVersion(btn.dataset.versionRestore)));
}

function versionKind(kind) {
  if (kind === "offers") return "Offers";
  if (kind === "prices") return "Prices";
  if (kind === "content") return "Page text";
  if (kind === "reviews") return "Reviews";
  return "Draft";
}

async function restoreDraftVersion(id) {
  if (typeof id === "string" && id.indexOf("srv:") === 0) return restoreServerVersion(id.slice(4));
  const localId = typeof id === "string" && id.indexOf("loc:") === 0 ? id.slice(4) : id;
  const row = draftVersions().find((v) => v.id === localId);
  if (!row) return;
  const ok = await ldConfirm({
    title: "Restore " + versionKind(row.kind) + "?",
    body: "This replaces the current local draft in this browser. It does not publish until you click Publish.",
    confirmLabel: "Restore draft"
  });
  if (!ok) return;
  applyRevisionPayload(row.kind, row.payload);
}

async function restoreServerVersion(id) {
  let rev;
  try {
    const res = await fetch("/admin/api/revisions/item?id=" + encodeURIComponent(id), { cache: "no-store", credentials: "same-origin" });
    const data = await ldReadJson(res);
    rev = data.revision;
  } catch (err) { toast(ldFriendlyError(err)); return; }
  if (!rev || rev.payload == null) { toast("That version could not be loaded."); return; }
  const isReviews = rev.kind === "reviews";
  if (isReviews && reviewsReadOnly()) return; // owner-only (restoring publishes)
  const ok = await ldConfirm({
    title: "Restore " + versionKind(rev.kind) + "?",
    body: isReviews
      ? "This replaces the current reviews with this snapshot and publishes it to the homepage right away."
      : "This replaces the current local draft in this browser. It does not publish until you click Publish.",
    confirmLabel: "Restore",
    danger: isReviews,
  });
  if (!ok) return;
  applyRevisionPayload(rev.kind, rev.payload);
}

function applyRevisionPayload(kind, payload) {
  if (kind === "offers") {
    state.offers = structuredClone(payload || []); selectedOfferIndex = 0; renderOffers();
    saveDraft("Offers restored from version history.");
  } else if (kind === "prices") {
    state.prices = structuredClone(payload || { groups: [] }); selectedTx = { gi: 0, ti: 0 }; renderPrices(); renderTreatmentCards();
    saveDraft("Prices restored from version history.");
  } else if (kind === "content") {
    state.content = structuredClone(payload || {}); renderContent();
    saveDraft("Page text restored from version history.");
  } else if (kind === "reviews") {
    if (reviewsReadOnly()) return;
    state.reviews = Array.isArray(payload && payload.reviews) ? structuredClone(payload.reviews) : [];
    if (payload && payload.summary) reviewsSummary = payload.summary;
    renderReviews();
    persistReviews("Reviews restored and published from version history.");
  }
}

function undoLastLocalEdit() {
  const previous = undoStack.pop();
  if (!previous) { toast("Nothing to undo in this browser."); return; }
  try {
    state = JSON.parse(previous);
    if (!Array.isArray(state.offers)) state.offers = [];
    if (!Array.isArray(state.reviews)) state.reviews = [];
    if (!Array.isArray(state.campaigns)) state.campaigns = [];
    if (!state.prices || !Array.isArray(state.prices.groups)) state.prices = { groups: [] };
    if (!state.content) state.content = {};
    selectedOfferIndex = 0;
    selectedTx = { gi: 0, ti: 0 };
    localStorage.setItem(STORAGE_KEY, previous);
    renderAll();
    updateLastSaved();
    updateMetrics();
    toast("Undid the last local edit.");
  } catch {
    toast("Could not undo that local edit.");
  }
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
  if (id === "prices") renderPrices();
  if (id === "treatments") { renderTreatmentCards(); refreshTreatmentGroupSelect(); renderTreatmentAddPreview(); }
  if (id === "birthday") loadBirthdayVouchers();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------------- Birthday vouchers ---------------- */
function bindBirthdayVouchers() {
  document.querySelector("[data-vouchers-reload]")?.addEventListener("click", () => loadBirthdayVouchers());
  document.querySelector("[data-collect-send]")?.addEventListener("click", sendCollectBirthdays);
  document.querySelector("[data-vouchers-body]")?.addEventListener("click", onVoucherAction);
}

async function loadBirthdayVouchers() {
  loadCollectCount();
  const body = document.querySelector("[data-vouchers-body]");
  if (!body) return;
  try {
    const res = await fetch("/admin/api/birthday/vouchers", { credentials: "same-origin", cache: "no-store" });
    const data = await ldReadJson(res);
    if (!res.ok) throw new Error(data.error || "Could not load vouchers.");
    renderVouchers(data.vouchers || []);
  } catch (err) {
    body.innerHTML = '<tr><td colspan="6">' + escapeHtml(ldFriendlyError(err)) + "</td></tr>";
  }
}

function voucherPill(label, n) { return '<span class="voucher-pill"><strong>' + n + "</strong> " + label + "</span>"; }

function renderVouchers(list) {
  const body = document.querySelector("[data-vouchers-body]");
  const summary = document.querySelector("[data-voucher-summary]");
  if (!body) return;
  if (summary) {
    const by = (s) => list.filter((v) => v.effective_status === s).length;
    summary.innerHTML = voucherPill("Active", by("active")) + voucherPill("Requested", by("requested")) + voucherPill("Redeemed", by("redeemed")) + voucherPill("Expired", by("expired"));
  }
  if (!list.length) { body.innerHTML = '<tr><td colspan="6">No birthday vouchers yet. They appear here once birthday emails go out.</td></tr>'; return; }
  body.innerHTML = list.map(voucherRow).join("");
}

function voucherRow(v) {
  const req = [v.req_treatment, v.req_times, v.req_phone, v.req_message].filter(Boolean).join(" · ");
  const status = v.effective_status || v.status;
  let action;
  if (status === "active" || status === "requested") {
    action = '<button class="admin-button admin-button-primary" data-voucher-action="redeem" data-voucher-id="' + v.id + '">Redeem</button> ' +
             '<button class="admin-button admin-button-secondary" data-voucher-action="cancel" data-voucher-id="' + v.id + '">Cancel</button>';
  } else {
    action = '<button class="admin-button admin-button-secondary" data-voucher-action="reactivate" data-voucher-id="' + v.id + '">Reactivate</button>';
  }
  return "<tr>" +
    "<td><code>" + escapeHtml(v.code) + "</code></td>" +
    "<td>" + escapeHtml(v.name || "—") + "<br><small>" + escapeHtml(v.email || "") + "</small></td>" +
    '<td><span class="voucher-status voucher-status-' + status + '">' + status + "</span></td>" +
    "<td>" + (req ? "<small>" + escapeHtml(req) + "</small>" : "<small>—</small>") + "</td>" +
    "<td><small>" + escapeHtml(voucherDate(v.expires_at)) + "</small></td>" +
    '<td class="voucher-actions">' + action + "</td>" +
    "</tr>";
}
function voucherDate(iso) { if (!iso) return ""; const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }

async function onVoucherAction(e) {
  const btn = e.target.closest("[data-voucher-action]");
  if (!btn) return;
  const id = Number(btn.dataset.voucherId), action = btn.dataset.voucherAction;
  if (action === "cancel") {
    const ok = await ldConfirm({ title: "Cancel this voucher?", body: "The code will stop working immediately. You can reactivate it later.", confirmLabel: "Cancel voucher" });
    if (!ok) return;
  }
  btn.disabled = true;
  try {
    const res = await fetch("/admin/api/birthday/vouchers/resolve", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const data = await ldReadJson(res);
    if (!res.ok) throw new Error(data.error || "Could not update the voucher.");
    toast(action === "redeem" ? "Marked redeemed." : action === "cancel" ? "Voucher cancelled." : "Voucher reactivated.");
    loadBirthdayVouchers();
  } catch (err) { btn.disabled = false; toast(ldFriendlyError(err)); }
}

async function loadCollectCount() {
  const el = document.querySelector("[data-collect-count]");
  if (!el) return;
  try {
    const res = await fetch("/admin/api/birthday/collect-campaign", { credentials: "same-origin", cache: "no-store" });
    const data = await ldReadJson(res);
    if (!res.ok) throw new Error(data.error || "");
    const n = data.count || 0;
    el.textContent = n === 0
      ? "Every confirmed subscriber already has a birthday on file."
      : n + " confirmed subscriber" + (n === 1 ? "" : "s") + " have no birthday yet — send them a friendly ask.";
  } catch { el.textContent = "Couldn't check how many subscribers need a birthday."; }
}

async function sendCollectBirthdays() {
  const ok = await ldConfirm({
    title: "Send the birthday-collection email?",
    body: "This emails confirmed subscribers who have no birthday on file, inviting them to add it for a yearly treat.",
    confirmLabel: "Send email",
  });
  if (!ok) return;
  const btn = document.querySelector("[data-collect-send]");
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
  try {
    const res = await fetch("/admin/api/birthday/collect-campaign", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}",
    });
    const data = await ldReadJson(res);
    if (!res.ok) throw new Error(data.error || "Could not send.");
    toast("Sent to " + (data.sent || 0) + " subscriber" + (data.sent === 1 ? "" : "s") + ".");
    loadCollectCount();
  } catch (err) { toast(ldFriendlyError(err)); }
  finally { if (btn) { btn.disabled = false; btn.textContent = "Send “add your birthday” email"; } }
}

/* ---------------- Top actions ---------------- */
function bindTopActions() {
  document.querySelectorAll("[data-export-admin]").forEach((b) => b.addEventListener("click", exportAll));
  document.querySelectorAll("[data-import-admin]").forEach((b) => b.addEventListener("click", () => document.querySelector("[data-import-file]").click()));
  document.querySelector("[data-import-file]")?.addEventListener("change", importAll);
  document.querySelector("[data-publish-demo]")?.addEventListener("click", () => goPanel("offers"));
  document.querySelector("[data-undo-local]")?.addEventListener("click", undoLastLocalEdit);
  document.querySelector("[data-birthday-reload]")?.addEventListener("click", loadBirthdays);
}

function exportAll() {
  download(`lumi-content-drafts-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), "application/json");
  toast("Content drafts backup exported (no personal data).");
}

function importAll(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const ok = await ldConfirm({
        title: "Import content drafts?",
        body: "This replaces your website content drafts (offers, prices, reviews, page text) in this browser with the file. Subscribers and personal data are not affected. You can use Undo local edit straight after if it was the wrong file.",
        confirmLabel: "Import content drafts"
      });
      if (!ok) { e.target.value = ""; return; }
      const data = JSON.parse(reader.result);
      state = { ...state, ...data };
      ["offers", "reviews", "campaigns"].forEach((k) => { if (!Array.isArray(state[k])) state[k] = []; });
      if (!state.prices || !Array.isArray(state.prices.groups)) state.prices = { groups: [] };
      selectedOfferIndex = 0; selectedTx = { gi: 0, ti: 0 };
      renderAll(); saveDraft("Content drafts imported.");
    } catch { toast("That file could not be read as a valid backup."); }
    e.target.value = "";
  };
  reader.readAsText(file);
}

/* ---------------- Offers ---------------- */
function bindOffers() {
  document.querySelector("[data-add-offer]")?.addEventListener("click", () => {
    state.offers.push({ title: "New offer", category: "Offer", price: "From £", badge: "", description: "Short offer description.", image: "", alt: "", service: "", status: "Live", featured: false, expires: "", note: "Ongoing offer" });
    selectedOfferIndex = state.offers.length - 1;
    renderOffers();
    saveDraft("New offer added \u2014 fill it in below, then Publish offers.");
    document.querySelector('[data-offer-field="title"]')?.focus();
  });
  document.querySelector("[data-save-publish-offer]")?.addEventListener("click", () => saveAndPublishOffer());
  document.querySelector("[data-delete-offer-editor]")?.addEventListener("click", () => deleteOffer(selectedOfferIndex));
  document.querySelectorAll("[data-offer-field]").forEach((f) => f.addEventListener("input", renderOfferPreview));
}

/* One offer at a time: validate + save just this offer to D1 (live now if Live). */
function toOfferPayload(o) {
  return {
    id: o.id || null,
    title: o.title || "", category: o.category || "", description: o.description || "",
    price: o.price || "", badge: o.badge || "", image: normalizeOfferImage(o.image), alt: o.alt || "",
    service: o.service || "",
    status: String(o.status || "live").toLowerCase() === "draft" ? "draft" : "live",
    featured: o.featured === true, expires: o.expires || "", note: o.note || "",
  };
}

async function saveAndPublishOffer() {
  const offer = state.offers[selectedOfferIndex];
  if (!offer) { toast("Pick an offer from the list first."); return; }
  Object.assign(offer, readOfferEditorFields());
  if (offerVisibleOnSite(offer)) {
    const reason = incompleteLiveOfferReason(offer);
    if (reason) { setPublishStatus("Not published: " + reason + "."); toast("Finish this offer first: " + reason + "."); return; }
  } else if (!(offer.title || "").trim()) {
    setPublishStatus("A draft still needs a title before it can be saved.");
    toast("Give the offer a title first."); return;
  }

  const btn = document.querySelector("[data-save-publish-offer]");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  setPublishStatus("Saving…");
  recordDraftVersion("offers", "Before saving an offer", state.offers);
  try {
    const res = await fetch("/admin/api/offers/upsert", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offer: toOfferPayload(offer) }),
    });
    const data = await ldReadJson(res);
    if (!res.ok) throw new Error(data.error || "Could not save the offer.");
    if (data.id) offer.id = data.id; // remember the D1 id for future edits
    saveDraft(null);
    renderOffers();
    const liveNow = String(offer.status || "").toLowerCase() === "live";
    setPublishStatus(liveNow ? "Saved — live on the homepage now (refresh to see it)." : "Saved as a draft — hidden from the site until you set it Live.");
    toast(liveNow ? "Offer is live now." : "Draft saved.");
  } catch (err) {
    setPublishStatus("Save failed: " + ldFriendlyError(err));
    toast("Save failed: " + ldFriendlyError(err));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Save & publish this offer"; }
  }
}

function readOfferEditorFields() {
  const data = {};
  document.querySelectorAll("[data-offer-field]").forEach((f) => {
    data[f.dataset.offerField] = f.type === "checkbox" ? f.checked : f.value;
  });
  data.featured = data.featured === true;
  return data;
}

function syncCurrentOfferEditorToState() {
  const offer = state.offers[selectedOfferIndex];
  if (!offer || !document.querySelector("[data-offer-field]")) return false;
  Object.assign(offer, readOfferEditorFields());
  saveDraft(null);
  return true;
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
  updateOfferImageStatus();
}

function renderOfferPreview() {
  const box = document.querySelector("[data-offer-preview]"); if (!box) return;
  const get = (k) => document.querySelector(`[data-offer-field="${k}"]`)?.value || "";
  box.innerHTML = `
    <div class="offer-preview-card">
      <img src="${escapeAttr(imageSrc(get("image")))}" alt="" data-hide-on-error>
      <div>
        <span>${escapeHtml(get("category") || "Category")}</span>
        <strong>${escapeHtml(get("title") || "Offer title")}</strong>
        <p>${escapeHtml(get("description") || "Short description")}</p>
        <b>${escapeHtml(get("price") || "from £")}</b>
      </div>
    </div>`;
}

/* ---------------- Treatments page cards ----------------
   The treatments page (pages/services.html) is generated from
   assets/data/prices.json between the PRICES markers. The clinic owner edits
   groups, cards, content blocks, prices and CTAs here; publishing rewrites both
   prices.json and the marked section of services.html. */
const PRICES_JSON_URL = "../assets/data/prices.json";

function bindPrices() {
  document.querySelector("[data-reload-prices]")?.addEventListener("click", async () => {
    const ok = await ldConfirm({
      title: "Reload live prices?",
      body: "This replaces the local prices in this browser with the prices currently on the website. You can use Undo local edit straight after if needed.",
      confirmLabel: "Reload live prices"
    });
    if (!ok) return;
    recordDraftVersion("prices", "Before reloading live prices", state.prices);
    loadPricesFromJson(true, true);
  });
}

function bindTreatmentCards() {
  document.querySelector("[data-add-treatment-group]")?.addEventListener("click", () => {
    ensurePricesData();
    const group = createTreatmentGroup();
    state.prices.groups.push(group);
    selectedTx = { gi: state.prices.groups.length - 1, ti: 0 };
    saveDraft("Treatment group added.");
    renderPrices();
    renderTreatmentCards();
  });

  document.querySelector("[data-reload-treatments]")?.addEventListener("click", async () => {
    const ok = await ldConfirm({
      title: "Reload live treatment cards?",
      body: "This replaces the local treatment cards in this browser with the treatment content currently on the website. You can use Undo local edit straight after if needed.",
      confirmLabel: "Reload treatment cards"
    });
    if (!ok) return;
    recordDraftVersion("prices", "Before reloading live treatment cards", state.prices);
    loadPricesFromJson(true, true);
  });
}

async function loadPricesFromJson(announce, force) {
  if (!force && state.prices && Array.isArray(state.prices.groups) && state.prices.groups.length) {
    renderPrices();
    renderTreatmentCards();
    return;
  }
  try {
    const r = await fetch("/admin/api/content", { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) throw new Error("unavailable");
    const data = await r.json();
    const p = (data && data.prices) || {};
    state.prices = { groups: Array.isArray(p.groups) ? p.groups : [] };
    selectedTx = { gi: 0, ti: 0 };
    renderPrices();
    renderTreatmentCards();
    saveDraft(announce ? "Loaded the treatments currently on the website." : null);
    setPricesStatus("In sync with the website.");
    setTreatmentStatus("In sync with the website.");
  } catch {
    if (announce) toast("Could not read the current treatments.");
    renderPrices();
    renderTreatmentCards();
  }
}

function setPricesStatus(message) {
  const el = document.querySelector("[data-prices-status]"); if (el) el.textContent = message;
}

function setTreatmentStatus(message) {
  const el = document.querySelector("[data-treatment-status]"); if (el) el.textContent = message;
}

// Strip tags for plain-text contexts (e.g. building nav labels). Keeps entities.
function stripTags(v) { return String(v == null ? "" : v).replace(/<[^>]*>/g, ""); }
// Decode HTML entities to plain text for editing inside <input> values.
function decodeHtml(v) { const el = document.createElement("textarea"); el.innerHTML = String(v == null ? "" : v); return el.value; }

function ensurePricesData() {
  if (!state.prices || !Array.isArray(state.prices.groups)) state.prices = { groups: [] };
  state.prices.groups.forEach((g) => {
    if (!Array.isArray(g.treatments)) g.treatments = [];
    g.treatments.forEach((t) => { if (!Array.isArray(t.detail)) t.detail = []; });
  });
}

function normaliseSelectedTx() {
  ensurePricesData();
  const groups = state.prices.groups;
  if (!groups.length) { selectedTx = { gi: 0, ti: 0 }; return; }
  selectedTx.gi = Math.max(0, Math.min(selectedTx.gi || 0, groups.length - 1));
  const treatments = groups[selectedTx.gi].treatments || [];
  selectedTx.ti = Math.max(0, Math.min(selectedTx.ti || 0, Math.max(0, treatments.length - 1)));
}

function currentTx() {
  normaliseSelectedTx();
  const g = state.prices && state.prices.groups ? state.prices.groups[selectedTx.gi] : null;
  return g && g.treatments ? g.treatments[selectedTx.ti] : null;
}

function currentTxGroup() {
  normaliseSelectedTx();
  return state.prices && state.prices.groups ? state.prices.groups[selectedTx.gi] : null;
}

function plainTreatmentHtml(v) {
  return escapeHtml(String(v || "").trim());
}

function richTreatmentHtml(v) {
  let s = escapeHtml(String(v || "").trim());
  const allowed = ["br", "strong", "em", "b", "i", "small"];
  allowed.forEach((tag) => {
    const open = new RegExp("&lt;" + tag + "\\s*\\/??&gt;", "gi");
    const close = new RegExp("&lt;\\/" + tag + "&gt;", "gi");
    s = s.replace(open, (m) => m.includes("/") || tag === "br" ? "<" + tag + ">" : "<" + tag + ">")
      .replace(close, "</" + tag + ">");
  });
  s = s.replace(/<br><\/br>/gi, "<br>").replace(/<br>/gi, "<br>");
  return s;
}

function treatmentSlug(v) {
  const base = decodeHtml(stripTags(v || ""))
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  return base || "new-treatment";
}

function uniqueTreatmentId(base, tx) {
  const wanted = treatmentSlug(base);
  const used = new Set();
  (state.prices.groups || []).forEach((g) => (g.treatments || []).forEach((t) => {
    if (t !== tx && t.id) used.add(String(t.id));
  }));
  let id = wanted;
  let n = 2;
  while (used.has(id)) {
    id = wanted + "-" + n;
    n += 1;
  }
  return id;
}

function createTreatmentCard(groupTitle) {
  const title = "New treatment";
  const id = uniqueTreatmentId(title);
  return {
    id,
    title,
    sub: groupTitle ? plainTreatmentHtml(decodeHtml(stripTags(groupTitle))) : "Treatment category",
    headline: "from £",
    service: id,
    bookLabel: "Book treatment",
    detail: [
      { type: "p", html: "Describe the treatment, who it is for and what to expect." },
      { type: "pricelist", rows: [{ name: "Treatment", cost: "£", costSmall: "" }] },
      { type: "note", text: "Consultation confirms suitability before treatment." }
    ]
  };
}

function createTreatmentGroup() {
  const group = { title: "New treatment group", treatments: [] };
  group.treatments.push(createTreatmentCard(group.title));
  return group;
}

function createTreatmentBlock(type) {
  if (type === "subhead") return { type: "subhead", text: "New section" };
  if (type === "note") return { type: "note", text: "Add a short note." };
  if (type === "pill") return { type: "pill", text: "Highlight important treatment information." };
  if (type === "table") return { type: "table", columns: ["Area", "Price"], rows: [["Treatment", "£"]] };
  if (type === "pricelist") return { type: "pricelist", rows: [{ name: "Treatment", cost: "£", costSmall: "" }] };
  return { type: "p", html: "Add treatment description." };
}

function saveTreatmentDraft(message, rerender) {
  saveDraft(message);
  if (rerender) {
    renderPrices();
    renderTreatmentCards();
  }
}

function renderPrices() {
  const nav = document.querySelector("[data-price-nav]");
  const editor = document.querySelector("[data-price-editor]");
  if (!nav || !editor) return;
  normaliseSelectedTx();
  const groups = (state.prices && state.prices.groups) || [];
  if (!groups.length) {
    nav.innerHTML = "";
    editor.innerHTML = '<p class="admin-hint">Loading the treatment menu&hellip; if this stays empty, click &ldquo;Reload from website&rdquo;.</p>';
    return;
  }
  nav.innerHTML = groups.map((g, gi) => `
    <div class="price-nav-group">
      <p class="price-nav-title">${stripTags(g.title || "Untitled group")}</p>
      ${(g.treatments || []).map((t, ti) => `
        <button type="button" class="price-nav-item ${gi === selectedTx.gi && ti === selectedTx.ti ? "is-selected" : ""}" data-price-pick="${gi}:${ti}">
          <span>${stripTags(t.title || "Untitled card")}</span><small>${escapeHtml(decodeHtml(t.headline || ""))}</small>
        </button>`).join("")}
    </div>`).join("");
  nav.querySelectorAll("[data-price-pick]").forEach((b) => b.addEventListener("click", () => {
    const parts = b.dataset.pricePick.split(":").map(Number);
    selectedTx = { gi: parts[0], ti: parts[1] };
    renderPrices();
    renderTreatmentCards();
  }));
  renderPriceEditor(editor);
}

function renderPriceEditor(editor) {
  const t = currentTx();
  if (!t) { editor.innerHTML = '<p class="admin-hint">Pick a treatment on the left to edit its prices.</p>'; return; }
  const groupTitle = stripTags(state.prices.groups[selectedTx.gi].title || "Treatment group");

  let html = `
    <div class="price-editor-head">
      <p class="admin-eyebrow">${groupTitle}</p>
      <h3>${stripTags(t.title || "Untitled card")}</h3>
      <p class="admin-hint">Change the prices, notes and the headline below. Use the Treatment cards tab for titles, descriptions, sections and buttons.</p>
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
  });

  html += `
    <div class="price-editor-publish">
      <button class="admin-button admin-button-primary admin-publish-btn" type="button" data-tx-publish-one>Save &amp; publish prices</button>
      <p class="admin-hint">Publishes your price changes to the live Treatments &amp; prices page straight away.</p>
    </div>`;

  editor.innerHTML = html;

  editor.querySelector("[data-tx-publish-one]")?.addEventListener("click", () => { publishPrices(); });

  editor.querySelector("[data-tx-headline]")?.addEventListener("change", (e) => {
    t.headline = escapeHtml(e.target.value.trim()); saveDraft("Headline updated."); updateNavHeadline(); renderTreatmentCards();
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

function renderTreatmentCards() {
  const nav = document.querySelector("[data-treatment-nav]");
  const editor = document.querySelector("[data-treatment-editor]");
  if (!nav || !editor) return;
  normaliseSelectedTx();
  const groups = (state.prices && state.prices.groups) || [];
  if (!groups.length) {
    nav.innerHTML = `
      <div class="price-nav-empty">
        <p class="admin-hint">No treatment cards loaded yet.</p>
        <button class="admin-button admin-button-secondary" type="button" data-treatment-action="add-group">Add treatment group</button>
      </div>`;
    editor.innerHTML = '<p class="admin-hint">Click &ldquo;Reload from website&rdquo; to load the live treatment cards, or add a new treatment group.</p>';
    bindTreatmentNav(nav);
    refreshTreatmentGroupSelect();
    return;
  }
  nav.innerHTML = `
    <div class="price-nav-head">
      <strong>${groups.length} group${groups.length === 1 ? "" : "s"}</strong>
      <button class="tiny-button primary" type="button" data-treatment-action="add-group">Add group</button>
    </div>
    ${groups.map((g, gi) => `
    <div class="price-nav-group">
      <div class="price-nav-title-row">
        <p class="price-nav-title">${stripTags(g.title || "Untitled group")}</p>
        <button class="tiny-button" type="button" data-treatment-action="add-treatment" data-group-index="${gi}">Add card</button>
      </div>
      ${(g.treatments || []).map((t, ti) => `
        <button type="button" class="price-nav-item ${gi === selectedTx.gi && ti === selectedTx.ti ? "is-selected" : ""}" data-treatment-pick="${gi}:${ti}">
          <span>${stripTags(t.title || "Untitled card")}</span><small>${escapeHtml(decodeHtml(t.headline || ""))}</small>
        </button>`).join("")}
      ${(g.treatments || []).length ? "" : '<p class="admin-hint">No cards in this group yet.</p>'}
    </div>`).join("")}`;
  bindTreatmentNav(nav);
  renderTreatmentCardEditor(editor);
  refreshTreatmentGroupSelect();
}

/* ---------------- Add a treatment card (simple, add-only flow) ----------------
   Mirrors the Offers "add new → publish just this one" pattern. She fills a
   single new card, picks an existing group (or types a new group title), and
   publishes; we append that one card to the live menu and edge-render it — the
   existing cards are never shown or altered here (edit them in the advanced
   section or the Prices tab). Reuses the same D1 publish path as Prices. */
function txnewEl(name) { return document.querySelector('[data-txnew="' + name + '"]'); }

function setTxnewStatus(message) {
  const el = document.querySelector("[data-txnew-status]"); if (el) el.textContent = message || "";
}

function priceRowHtml() {
  return '<div class="txnew-row" data-txnew-row>' +
    '<input type="text" data-txnew-cell="name" placeholder="Name (e.g. Face + Neck · 1 session)">' +
    '<input type="text" data-txnew-cell="cost" placeholder="£100">' +
    '<input type="text" data-txnew-cell="small" placeholder="small note (e.g. 45 min)">' +
    '<button type="button" class="tiny-button" data-txnew-delrow aria-label="Remove row">✕</button>' +
    "</div>";
}

function toggleNewGroupInput() {
  const wrap = document.querySelector("[data-txnew-newgroup-wrap]");
  const sel = txnewEl("groupChoice");
  if (wrap && sel) wrap.hidden = sel.value !== "__new__";
}

function refreshTreatmentGroupSelect() {
  const sel = txnewEl("groupChoice");
  if (!sel) return;
  ensurePricesData();
  const prev = sel.value;
  const opts = (state.prices.groups || []).map((g, i) =>
    '<option value="' + i + '">' + escapeHtml(decodeHtml(stripTags(g.title || "Untitled group"))) + "</option>").join("");
  sel.innerHTML = opts + '<option value="__new__">➕ New group…</option>';
  if (prev && (prev === "__new__" || sel.querySelector('option[value="' + prev + '"]'))) sel.value = prev;
  toggleNewGroupInput();
}

function currentAddGroupTitle() {
  const sel = txnewEl("groupChoice");
  if (!sel) return "";
  if (sel.value === "__new__") return decodeHtml(stripTags(txnewEl("newGroup") ? txnewEl("newGroup").value : "")).trim();
  const g = (state.prices.groups || [])[parseInt(sel.value, 10)];
  return g ? decodeHtml(stripTags(g.title || "")) : "";
}

// Split a textarea into paragraphs on blank lines; collapse single newlines to spaces.
function splitParagraphs(text) {
  return String(text || "").split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
}

function buildNewTxFromForm() {
  ensurePricesData();
  const titlePlain = decodeHtml(stripTags(txnewEl("title") ? txnewEl("title").value : "")).trim();
  const sub = txnewEl("sub") ? txnewEl("sub").value.trim() : "";
  const headline = txnewEl("headline") ? txnewEl("headline").value.trim() : "";
  const desc = txnewEl("description") ? txnewEl("description").value : "";
  const pill = txnewEl("pill") ? txnewEl("pill").value.trim() : "";
  const note = txnewEl("note") ? txnewEl("note").value.trim() : "";
  const bookLabel = (txnewEl("bookLabel") && txnewEl("bookLabel").value.trim()) || "Book now";

  const rows = [];
  document.querySelectorAll("[data-txnew-row]").forEach((r) => {
    const name = r.querySelector('[data-txnew-cell="name"]').value.trim();
    const cost = r.querySelector('[data-txnew-cell="cost"]').value.trim();
    const small = r.querySelector('[data-txnew-cell="small"]').value.trim();
    if (name || cost) rows.push({ name: richTreatmentHtml(name), cost: plainTreatmentHtml(cost), costSmall: plainTreatmentHtml(small) });
  });

  const detail = [];
  splitParagraphs(desc).forEach((p) => detail.push({ type: "p", html: richTreatmentHtml(p) }));
  if (rows.length) detail.push({ type: "pricelist", rows });
  if (pill) detail.push({ type: "pill", text: richTreatmentHtml(pill) });
  if (note) detail.push({ type: "note", text: richTreatmentHtml(note) });

  return {
    id: uniqueTreatmentId(titlePlain || "new-treatment"),
    title: plainTreatmentHtml(titlePlain),
    sub: plainTreatmentHtml(sub),
    headline: plainTreatmentHtml(headline),
    service: "",
    bookLabel: plainTreatmentHtml(bookLabel),
    detail
  };
}

function renderTreatmentAddPreview() {
  const box = document.querySelector("[data-txnew-preview]");
  if (!box) return;
  if (typeof window.renderTreatmentLibrary !== "function") { box.innerHTML = '<p class="admin-hint">Preview will appear once the template loads.</p>'; return; }
  const tx = buildNewTxFromForm();
  const groupTitle = currentAddGroupTitle() || "New group";
  box.innerHTML = window.renderTreatmentLibrary({ groups: [{ title: plainTreatmentHtml(groupTitle), treatments: [tx] }] });
  const detail = box.querySelector(".tx-card-detail"); if (detail) detail.hidden = false;
}

function resetTreatmentAddForm() {
  ["title", "sub", "headline", "description", "pill", "note", "newGroup"].forEach((n) => { const el = txnewEl(n); if (el) el.value = ""; });
  const bl = txnewEl("bookLabel"); if (bl) bl.value = "";
  const rows = document.querySelector("[data-txnew-rows]"); if (rows) rows.innerHTML = priceRowHtml();
  const sel = txnewEl("groupChoice"); if (sel && sel.options.length) sel.selectedIndex = 0;
  toggleNewGroupInput();
  renderTreatmentAddPreview();
}

function bindTreatmentAddForm() {
  const form = document.querySelector("[data-tx-add-form]");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "1";
  refreshTreatmentGroupSelect();
  const rows = document.querySelector("[data-txnew-rows]");
  if (rows && !rows.children.length) rows.innerHTML = priceRowHtml();

  form.addEventListener("input", renderTreatmentAddPreview);
  const sel = txnewEl("groupChoice");
  if (sel) sel.addEventListener("change", () => { toggleNewGroupInput(); renderTreatmentAddPreview(); });
  const addRow = document.querySelector("[data-txnew-addrow]");
  if (addRow) addRow.addEventListener("click", () => {
    const c = document.querySelector("[data-txnew-rows]"); if (c) c.insertAdjacentHTML("beforeend", priceRowHtml());
    renderTreatmentAddPreview();
  });
  if (rows) rows.addEventListener("click", (e) => {
    const del = e.target.closest("[data-txnew-delrow]"); if (!del) return;
    const all = document.querySelectorAll("[data-txnew-row]");
    if (all.length > 1) del.closest("[data-txnew-row]").remove();
    else del.closest("[data-txnew-row]").querySelectorAll("input").forEach((i) => { i.value = ""; });
    renderTreatmentAddPreview();
  });
  const pub = document.querySelector("[data-txnew-publish]");
  if (pub) pub.addEventListener("click", publishNewTreatmentCard);
  const reset = document.querySelector("[data-txnew-reset]");
  if (reset) reset.addEventListener("click", resetTreatmentAddForm);
  renderTreatmentAddPreview();
}

async function publishNewTreatmentCard() {
  if (typeof window.renderTreatmentLibrary !== "function") { toast("Treatment template didn’t load — hard-refresh the admin and try again."); return false; }
  const titlePlain = decodeHtml(stripTags(txnewEl("title") ? txnewEl("title").value : "")).trim();
  if (!titlePlain) { setTxnewStatus("Add a card title first."); toast("Add a card title first."); return false; }

  const sel = txnewEl("groupChoice");
  const isNewGroup = sel && sel.value === "__new__";
  let newGroupTitle = "";
  if (isNewGroup) {
    newGroupTitle = decodeHtml(stripTags(txnewEl("newGroup") ? txnewEl("newGroup").value : "")).trim();
    if (!newGroupTitle) { setTxnewStatus("Type a name for the new group."); toast("Type a new group name first."); return false; }
  }

  if (!(await ldConfirm({
    title: "Add & publish this card?",
    body: "This adds “" + titlePlain + "” to the Treatments & prices page and publishes it live straight away. Continue?",
    confirmLabel: "Add & publish"
  }))) return false;

  const button = document.querySelector("[data-txnew-publish]");
  if (button) { button.disabled = true; button.textContent = "Publishing…"; }
  setTxnewStatus("Publishing…");
  ensurePricesData();
  recordDraftVersion("prices", "Before adding a treatment card", state.prices);
  try {
    // Build the new card (unique id computed against the current menu) and
    // append it — existing cards are left exactly as they are.
    const tx = buildNewTxFromForm();
    let group;
    if (isNewGroup) {
      group = { title: plainTreatmentHtml(newGroupTitle), treatments: [] };
      state.prices.groups.push(group);
    } else {
      group = state.prices.groups[parseInt(sel.value, 10)];
      if (!group) { group = { title: plainTreatmentHtml("Treatments"), treatments: [] }; state.prices.groups.push(group); }
    }
    group.treatments.push(tx);

    const rendered = window.renderTreatmentLibrary(state.prices);
    const before = await ghReadRepoFile(SERVICES_REPO_PATH);
    if (!PRICES_MARKERS.test(before)) throw new Error("The price markers weren’t found in services.html — ask Dima to check the page.");
    const pageHtml = before.replace(PRICES_MARKERS, (m, s, e) => s + "\n\n" + rendered + "\n\n          " + e);
    await ghPublishContent({ prices: state.prices, regions: ["PRICES"], pages: { [SERVICES_REPO_PATH]: pageHtml } });

    state.publishedAt = new Date().toISOString();
    saveDraft(null);
    setTxnewStatus("Added and live now. Refresh the Treatments page to see “" + titlePlain + "”.");
    toast("Treatment card added and published.");
    resetTreatmentAddForm();
    refreshTreatmentGroupSelect();
    renderPrices();
    renderTreatmentCards();
    return true;
  } catch (err) {
    setTxnewStatus("Save failed: " + ldFriendlyError(err));
    toast("Save failed: " + ldFriendlyError(err));
    return false;
  } finally {
    if (button) { button.disabled = false; button.textContent = "Add & publish this card"; }
  }
}

function bindTreatmentNav(nav) {
  nav.querySelectorAll("[data-treatment-pick]").forEach((b) => b.addEventListener("click", () => {
    const parts = b.dataset.treatmentPick.split(":").map(Number);
    selectedTx = { gi: parts[0], ti: parts[1] };
    renderPrices();
    renderTreatmentCards();
  }));
  nav.querySelectorAll("[data-treatment-action]").forEach((btn) => btn.addEventListener("click", () => {
    const action = btn.dataset.treatmentAction;
    ensurePricesData();
    if (action === "add-group") {
      state.prices.groups.push(createTreatmentGroup());
      selectedTx = { gi: state.prices.groups.length - 1, ti: 0 };
      saveTreatmentDraft("Treatment group added.", true);
    } else if (action === "add-treatment") {
      const gi = Number(btn.dataset.groupIndex);
      const group = state.prices.groups[gi];
      if (!group) return;
      group.treatments.push(createTreatmentCard(group.title));
      selectedTx = { gi, ti: group.treatments.length - 1 };
      saveTreatmentDraft("Treatment card added.", true);
    }
  }));
}

function renderTreatmentCardEditor(editor) {
  const t = currentTx();
  const group = currentTxGroup();
  if (!group) { editor.innerHTML = '<p class="admin-hint">Add a treatment group to start editing the Treatments page.</p>'; return; }
  if (!t) {
    editor.innerHTML = `
      <div class="price-editor-head">
        <p class="admin-eyebrow">Treatment group</p>
        <h3>${stripTags(group.title || "Untitled group")}</h3>
        <p class="admin-hint">This group has no cards yet.</p>
      </div>
      <div class="admin-actions-inline start">
        <button class="admin-button admin-button-primary" type="button" data-price-action="add-treatment-current">Add treatment card</button>
        <button class="admin-button admin-button-secondary" type="button" data-price-action="delete-group">Delete group</button>
      </div>`;
    bindPriceEditor(editor, group, null);
    return;
  }
  const groupTitle = stripTags(group.title || "Treatment group");

  let html = `
    <div class="price-editor-head">
      <p class="admin-eyebrow">${groupTitle}</p>
      <h3>${stripTags(t.title || "Untitled card")}</h3>
      <p class="admin-hint">Edit the group title, card text, booking button and the content that opens inside this treatment card.</p>
    </div>
    <section class="price-card-section">
      <div class="price-section-head">
        <strong>Group</strong>
        <div class="price-inline-actions">
          <button class="tiny-button" type="button" data-price-action="move-group-up" ${selectedTx.gi === 0 ? "disabled" : ""}>Move up</button>
          <button class="tiny-button" type="button" data-price-action="move-group-down" ${selectedTx.gi >= state.prices.groups.length - 1 ? "disabled" : ""}>Move down</button>
          <button class="tiny-button danger" type="button" data-price-action="delete-group">Delete group</button>
        </div>
      </div>
      <label>Group title <small>shown as treatment-group-title</small>
        <input type="text" value="${escapeAttr(decodeHtml(stripTags(group.title || "")))}" data-price-field="group-title">
      </label>
    </section>
    <section class="price-card-section">
      <div class="price-section-head">
        <strong>Treatment card</strong>
        <div class="price-inline-actions">
          <button class="tiny-button" type="button" data-price-action="move-treatment-up" ${selectedTx.ti === 0 ? "disabled" : ""}>Move up</button>
          <button class="tiny-button" type="button" data-price-action="move-treatment-down" ${selectedTx.ti >= (group.treatments || []).length - 1 ? "disabled" : ""}>Move down</button>
          <button class="tiny-button" type="button" data-price-action="duplicate-treatment">Duplicate</button>
          <button class="tiny-button danger" type="button" data-price-action="delete-treatment">Delete card</button>
        </div>
      </div>
      <div class="price-field-grid">
        <label>Card ID <small>page anchor, auto-formatted</small><input type="text" value="${escapeAttr(t.id || "")}" data-price-field="id"></label>
        <label>Card title <small>shown as tx-title</small><input type="text" value="${escapeAttr(decodeHtml(stripTags(t.title || "")))}" data-price-field="title"></label>
        <label>Subtitle <small>shown as tx-sub</small><input type="text" value="${escapeAttr(decodeHtml(stripTags(t.sub || "")))}" data-price-field="sub"></label>
        <label>Headline price <small>shown as tx-price</small><input type="text" value="${escapeAttr(decodeHtml(stripTags(t.headline || "")))}" data-price-field="headline"></label>
        <label>Booking service slug <small>booking.html?service=...</small><input type="text" value="${escapeAttr(t.service || "")}" data-price-field="service"></label>
        <label>Button label <small>shown in the opened card</small><input type="text" value="${escapeAttr(decodeHtml(stripTags(t.bookLabel || "")))}" data-price-field="bookLabel"></label>
      </div>
    </section>
    <section class="price-card-section">
      <div class="price-section-head">
        <strong>Opened card content</strong>
      </div>
      <div class="price-block-tools" aria-label="Add content block">
        <button class="tiny-button" type="button" data-add-block="p">Add paragraph</button>
        <button class="tiny-button" type="button" data-add-block="subhead">Add subheading</button>
        <button class="tiny-button" type="button" data-add-block="pricelist">Add price list</button>
        <button class="tiny-button" type="button" data-add-block="table">Add table</button>
        <button class="tiny-button" type="button" data-add-block="pill">Add highlight</button>
        <button class="tiny-button" type="button" data-add-block="note">Add note</button>
      </div>
      <div class="price-block-list">`;

  (t.detail || []).forEach((b, bi) => {
    html += renderTreatmentBlockEditor(b, bi, t.detail.length);
  });

  html += `</div></section>`;
  editor.innerHTML = html;
  bindPriceEditor(editor, group, t);
}

function renderTreatmentBlockEditor(b, bi, count) {
  const label = { p: "Paragraph", subhead: "Subheading", table: "Price table", pricelist: "Price list", pill: "Highlight", note: "Note" }[b.type] || "Content block";
  let body = "";
  if (b.type === "p") {
    body = `<label>Paragraph text <small>simple formatting: &lt;strong&gt;, &lt;em&gt;, &lt;br&gt;</small><textarea class="price-html-edit" data-block-field="${bi}:html">${escapeHtml(decodeHtml(b.html || ""))}</textarea></label>`;
  } else if (b.type === "subhead") {
    body = `<label>Subheading text<input type="text" value="${escapeAttr(decodeHtml(stripTags(b.text || "")))}" data-block-field="${bi}:text"></label>`;
  } else if (b.type === "pill") {
    body = `<label>Highlight text<input type="text" value="${escapeAttr(decodeHtml(stripTags(b.text || "")))}" data-block-field="${bi}:text"></label>`;
  } else if (b.type === "note") {
    body = `<label>Note text<input type="text" value="${escapeAttr(decodeHtml(stripTags(b.text || "")))}" data-block-field="${bi}:text"></label>`;
  } else if (b.type === "pricelist") {
    body = `<div class="price-list-edit">`;
    (b.rows || []).forEach((row, ri) => {
      body += `
        <div class="price-list-row price-list-row-edit">
          <label>Name<input type="text" value="${escapeAttr(decodeHtml(row.name || ""))}" data-list-field="${bi}:${ri}:name"></label>
          <label>Price<input type="text" class="price-list-cost" value="${escapeAttr(decodeHtml(row.cost || ""))}" data-list-field="${bi}:${ri}:cost"></label>
          <label>Small note<input type="text" class="price-list-small" value="${escapeAttr(decodeHtml(row.costSmall || ""))}" data-list-field="${bi}:${ri}:costSmall" placeholder="e.g. pay in 2 instalments"></label>
          <button class="tiny-button danger" type="button" data-block-action="delete-list-row" data-block-index="${bi}" data-row-index="${ri}">Delete row</button>
        </div>`;
    });
    body += `<button class="tiny-button" type="button" data-block-action="add-list-row" data-block-index="${bi}">Add price row</button></div>`;
  } else if (b.type === "table") {
    const cols = Array.isArray(b.columns) && b.columns.length ? b.columns : ["Area", "Price"];
    const rows = Array.isArray(b.rows) ? b.rows : [];
    body = `<div class="price-table-tools"><strong>Columns</strong><button class="tiny-button" type="button" data-block-action="add-table-column" data-block-index="${bi}">Add column</button></div>
      <div class="price-table-columns">`;
    cols.forEach((c, ci) => {
      body += `<label>Column ${ci + 1}<input type="text" value="${escapeAttr(decodeHtml(c || ""))}" data-table-column="${bi}:${ci}"></label>
        <button class="tiny-button danger" type="button" data-block-action="delete-table-column" data-block-index="${bi}" data-column-index="${ci}" ${cols.length <= 1 ? "disabled" : ""}>Delete column</button>`;
    });
    body += `</div><div class="price-table-edit"><table><tbody>`;
    rows.forEach((row, ri) => {
      body += `<tr>`;
      cols.forEach((c, ci) => {
        body += `<td><input type="text" value="${escapeAttr(decodeHtml(row[ci] || ""))}" data-table-cell="${bi}:${ri}:${ci}" aria-label="Table row ${ri + 1}, column ${ci + 1}"></td>`;
      });
      body += `<td class="price-row-tools"><button class="tiny-button danger" type="button" data-block-action="delete-table-row" data-block-index="${bi}" data-row-index="${ri}">Delete row</button></td></tr>`;
    });
    body += `</tbody></table></div><button class="tiny-button" type="button" data-block-action="add-table-row" data-block-index="${bi}">Add table row</button>`;
  }
  return `
    <article class="price-block-edit">
      <div class="price-block-head">
        <strong>${label}</strong>
        <div class="price-inline-actions">
          <button class="tiny-button" type="button" data-block-action="move-block-up" data-block-index="${bi}" ${bi === 0 ? "disabled" : ""}>Move up</button>
          <button class="tiny-button" type="button" data-block-action="move-block-down" data-block-index="${bi}" ${bi >= count - 1 ? "disabled" : ""}>Move down</button>
          <button class="tiny-button danger" type="button" data-block-action="delete-block" data-block-index="${bi}">Delete</button>
        </div>
      </div>
      ${body}
    </article>`;
}

function bindPriceEditor(editor, group, t) {
  editor.querySelectorAll("[data-price-field]").forEach((inp) => inp.addEventListener("change", () => {
    if (inp.dataset.priceField === "group-title") {
      group.title = plainTreatmentHtml(inp.value);
      saveTreatmentDraft("Treatment group updated.", true);
      return;
    }
    if (!t) return;
    const key = inp.dataset.priceField;
    if (key === "id") {
      t.id = uniqueTreatmentId(inp.value, t);
      if (!t.service || treatmentSlug(t.service) === treatmentSlug(inp.value)) t.service = t.id;
      saveTreatmentDraft("Card ID updated.", true);
    } else if (key === "service") {
      t.service = treatmentSlug(inp.value);
      saveTreatmentDraft("Booking link updated.", false);
    } else {
      t[key] = plainTreatmentHtml(inp.value);
      saveTreatmentDraft("Treatment card updated.", key === "title" || key === "headline");
    }
  }));

  editor.querySelectorAll("[data-block-field]").forEach((inp) => inp.addEventListener("change", () => {
    if (!t) return;
    const [bi, field] = inp.dataset.blockField.split(":");
    const block = t.detail[Number(bi)];
    if (!block) return;
    block[field] = field === "html" ? richTreatmentHtml(inp.value) : plainTreatmentHtml(inp.value);
    saveTreatmentDraft("Treatment content updated.", false);
  }));

  editor.querySelectorAll("[data-list-field]").forEach((inp) => inp.addEventListener("change", () => {
    if (!t) return;
    const [bi, ri, field] = inp.dataset.listField.split(":");
    const row = t.detail[Number(bi)]?.rows?.[Number(ri)];
    if (!row) return;
    row[field] = field === "name" ? richTreatmentHtml(inp.value) : plainTreatmentHtml(inp.value);
    saveTreatmentDraft("Price row updated.", false);
  }));

  editor.querySelectorAll("[data-table-column]").forEach((inp) => inp.addEventListener("change", () => {
    if (!t) return;
    const [bi, ci] = inp.dataset.tableColumn.split(":").map(Number);
    const block = t.detail[bi];
    if (!block || block.type !== "table") return;
    block.columns[ci] = richTreatmentHtml(inp.value);
    saveTreatmentDraft("Table column updated.", false);
  }));

  editor.querySelectorAll("[data-table-cell]").forEach((inp) => inp.addEventListener("change", () => {
    if (!t) return;
    const [bi, ri, ci] = inp.dataset.tableCell.split(":").map(Number);
    const block = t.detail[bi];
    if (!block || block.type !== "table" || !block.rows[ri]) return;
    block.rows[ri][ci] = richTreatmentHtml(inp.value);
    saveTreatmentDraft("Table cell updated.", false);
  }));

  editor.querySelectorAll("[data-add-block]").forEach((btn) => btn.addEventListener("click", () => {
    if (!t) return;
    t.detail.push(createTreatmentBlock(btn.dataset.addBlock));
    saveTreatmentDraft("Content block added.", true);
  }));

  editor.querySelectorAll("[data-price-action], [data-block-action]").forEach((btn) => btn.addEventListener("click", async () => {
    const action = btn.dataset.priceAction || btn.dataset.blockAction;
    await handlePriceEditorAction(action, btn, group, t);
  }));
}

async function handlePriceEditorAction(action, btn, group, t) {
  ensurePricesData();
  if (action === "add-treatment-current") {
    group.treatments.push(createTreatmentCard(group.title));
    selectedTx.ti = group.treatments.length - 1;
    saveTreatmentDraft("Treatment card added.", true);
  } else if (action === "move-group-up" || action === "move-group-down") {
    const dir = action === "move-group-up" ? -1 : 1;
    const to = selectedTx.gi + dir;
    if (to < 0 || to >= state.prices.groups.length) return;
    [state.prices.groups[selectedTx.gi], state.prices.groups[to]] = [state.prices.groups[to], state.prices.groups[selectedTx.gi]];
    selectedTx.gi = to;
    saveTreatmentDraft("Treatment group moved.", true);
  } else if (action === "delete-group") {
    const ok = await ldConfirm({ title: "Delete treatment group?", body: "This removes the group and every card inside it from the Treatments page draft.", confirmLabel: "Delete group", danger: true });
    if (!ok) return;
    state.prices.groups.splice(selectedTx.gi, 1);
    normaliseSelectedTx();
    saveTreatmentDraft("Treatment group deleted.", true);
  } else if (action === "move-treatment-up" || action === "move-treatment-down") {
    const rows = group.treatments || [];
    const dir = action === "move-treatment-up" ? -1 : 1;
    const to = selectedTx.ti + dir;
    if (to < 0 || to >= rows.length) return;
    [rows[selectedTx.ti], rows[to]] = [rows[to], rows[selectedTx.ti]];
    selectedTx.ti = to;
    saveTreatmentDraft("Treatment card moved.", true);
  } else if (action === "duplicate-treatment" && t) {
    const copy = structuredClone(t);
    copy.title = plainTreatmentHtml(decodeHtml(stripTags(t.title || "Treatment")) + " copy");
    copy.id = uniqueTreatmentId(copy.title, copy);
    copy.service = copy.id;
    group.treatments.splice(selectedTx.ti + 1, 0, copy);
    selectedTx.ti += 1;
    saveTreatmentDraft("Treatment card duplicated.", true);
  } else if (action === "delete-treatment" && t) {
    const ok = await ldConfirm({ title: "Delete treatment card?", body: "This removes the selected treatment card from the Treatments page draft.", confirmLabel: "Delete card", danger: true });
    if (!ok) return;
    group.treatments.splice(selectedTx.ti, 1);
    normaliseSelectedTx();
    saveTreatmentDraft("Treatment card deleted.", true);
  } else if (action && action.startsWith("move-block") && t) {
    const bi = Number(btn.dataset.blockIndex);
    const dir = action === "move-block-up" ? -1 : 1;
    const to = bi + dir;
    if (to < 0 || to >= t.detail.length) return;
    [t.detail[bi], t.detail[to]] = [t.detail[to], t.detail[bi]];
    saveTreatmentDraft("Content block moved.", true);
  } else if (action === "delete-block" && t) {
    t.detail.splice(Number(btn.dataset.blockIndex), 1);
    saveTreatmentDraft("Content block deleted.", true);
  } else if (action === "add-list-row" && t) {
    const block = t.detail[Number(btn.dataset.blockIndex)];
    if (!block || block.type !== "pricelist") return;
    block.rows.push({ name: "New item", cost: "£", costSmall: "" });
    saveTreatmentDraft("Price row added.", true);
  } else if (action === "delete-list-row" && t) {
    const block = t.detail[Number(btn.dataset.blockIndex)];
    if (!block || block.type !== "pricelist") return;
    block.rows.splice(Number(btn.dataset.rowIndex), 1);
    saveTreatmentDraft("Price row deleted.", true);
  } else if (action === "add-table-column" && t) {
    const block = t.detail[Number(btn.dataset.blockIndex)];
    if (!block || block.type !== "table") return;
    block.columns.push("New column");
    (block.rows || []).forEach((row) => row.push(""));
    saveTreatmentDraft("Table column added.", true);
  } else if (action === "delete-table-column" && t) {
    const block = t.detail[Number(btn.dataset.blockIndex)];
    if (!block || block.type !== "table" || block.columns.length <= 1) return;
    const ci = Number(btn.dataset.columnIndex);
    block.columns.splice(ci, 1);
    (block.rows || []).forEach((row) => row.splice(ci, 1));
    saveTreatmentDraft("Table column deleted.", true);
  } else if (action === "add-table-row" && t) {
    const block = t.detail[Number(btn.dataset.blockIndex)];
    if (!block || block.type !== "table") return;
    block.rows.push((block.columns || ["Area", "Price"]).map((c, i) => (i === 0 ? "New row" : "")));
    saveTreatmentDraft("Table row added.", true);
  } else if (action === "delete-table-row" && t) {
    const block = t.detail[Number(btn.dataset.blockIndex)];
    if (!block || block.type !== "table") return;
    block.rows.splice(Number(btn.dataset.rowIndex), 1);
    saveTreatmentDraft("Table row deleted.", true);
  }
}

// Update just the selected nav item's headline label (no full re-render, keeps scroll).
function updateNavHeadline() {
  const t = currentTx(); if (!t) return;
  const small = document.querySelector(`[data-price-pick="${selectedTx.gi}:${selectedTx.ti}"] small`);
  if (small) small.textContent = decodeHtml(t.headline || "");
  const treatmentSmall = document.querySelector(`[data-treatment-pick="${selectedTx.gi}:${selectedTx.ti}"] small`);
  if (treatmentSmall) treatmentSmall.textContent = decodeHtml(t.headline || "");
}

/* ---------------- Reviews ---------------- */
function bindReviews() {
  ["[data-review-filter]", "[data-review-rating-filter]", "[data-review-source-filter]"].forEach((sel) => {
    document.querySelector(sel)?.addEventListener("change", renderReviews);
  });
  document.querySelector("[data-review-search]")?.addEventListener("input", renderReviews);
  document.querySelector("[data-add-review]")?.addEventListener("click", () => openReviewEditor(null));
  document.querySelector("[data-import-google]")?.addEventListener("click", importGoogleReviews);
  document.querySelectorAll("[data-review-summary]").forEach((f) => {
    f.addEventListener("input", () => {
      if (reviewsReadOnly()) return;
      const k = f.dataset.reviewSummary;
      reviewsSummary[k] = k === "count" ? (parseInt(f.value, 10) || 0) : f.value;
      persistReviews(null);
    });
  });
  document.querySelector("[data-review-sub-reload]")?.addEventListener("click", loadReviewSubmissions);
  const revNav = document.querySelector('[data-admin-panel="reviews"]');
  if (revNav) revNav.addEventListener("click", () => setTimeout(loadReviewSubmissions, 0), { once: true });
  renderReviewSummaryFields();
}

function renderReviewSummaryFields() {
  document.querySelectorAll("[data-review-summary]").forEach((f) => {
    const v = reviewsSummary[f.dataset.reviewSummary];
    f.value = v == null ? "" : v;
  });
}

/* ---- Client review submissions (from the website form) ---- */
const REVIEW_SUB_API = "/admin/api/reviews/submissions";
let reviewSubmissionsCount = 0;
let reviewSubmissionsCache = [];

async function loadReviewSubmissions() {
  const card = document.querySelector("[data-review-submissions-card]");
  const box = document.querySelector("[data-review-submissions]");
  // Moderating submissions is owner-only; assistants simply don't see the card.
  if (adminRole === "assistant") {
    reviewSubmissionsCount = 0;
    if (card) card.hidden = true;
    return;
  }
  try {
    const res = await fetch(REVIEW_SUB_API, { cache: "no-store", credentials: "same-origin" });
    if (res.status === 403) { reviewSubmissionsCount = 0; if (card) card.hidden = true; updateMetrics(); return; }
    const data = await ldReadJson(res);
    reviewSubmissionsCache = data.submissions || [];
    reviewSubmissionsCount = reviewSubmissionsCache.length;
    renderReviewSubmissions(reviewSubmissionsCache);
    if (card) card.hidden = reviewSubmissionsCount === 0;
    const badge = document.querySelector("[data-review-sub-count]");
    if (badge) badge.textContent = reviewSubmissionsCount ? "(" + reviewSubmissionsCount + ")" : "";
    updateMetrics();
  } catch (err) {
    if (box) box.innerHTML = '<p class="admin-status is-error">' + escapeHtml(ldFriendlyError(err)) + "</p>";
  }
}

function renderReviewSubmissions(subs) {
  const box = document.querySelector("[data-review-submissions]"); if (!box) return;
  if (!subs.length) { box.innerHTML = '<p class="admin-help">No new submissions right now.</p>'; return; }
  box.innerHTML = subs.map((s) => {
    const stars = "★".repeat(Math.max(1, Math.min(5, +s.rating || 5)));
    const meta = [s.treatment, s.email].filter(Boolean).join(" · ");
    return '<article class="review-sub-item">' +
      '<div class="review-sub-body">' +
        '<div class="review-meta"><strong>' + escapeHtml(s.name || "Anonymous") + '</strong><span class="review-stars">' + stars + '</span><span class="review-sub-when">' + escapeHtml(auditWhen(s.created_at)) + "</span></div>" +
        "<p>" + escapeHtml(s.text || "") + "</p>" +
        (meta ? "<small>" + escapeHtml(meta) + "</small>" : "") +
      "</div>" +
      '<div class="review-actions">' +
        '<button class="tiny-button primary" type="button" data-sub-import="' + s.id + '">Add to reviews</button>' +
        '<button class="tiny-button danger" type="button" data-sub-reject="' + s.id + '">Reject</button>' +
      "</div>" +
    "</article>";
  }).join("");
  box.querySelectorAll("[data-sub-import]").forEach((b) => b.addEventListener("click", () => importSubmission(+b.dataset.subImport)));
  box.querySelectorAll("[data-sub-reject]").forEach((b) => b.addEventListener("click", () => rejectSubmission(+b.dataset.subReject)));
}

function importSubmission(id) {
  if (reviewsReadOnly()) return;
  const s = reviewSubmissionsCache.find((x) => x.id === id); if (!s) return;
  state.reviews.unshift({
    name: s.name || "Client", initial: (s.name || "C").charAt(0).toUpperCase(),
    rating: Number(s.rating) || 5, treatment: s.treatment || "", source: "Website",
    text: s.text || "", status: "pending", featured: false,
  });
  renderReviews();
  persistReviews(null);
  resolveSubmission(id, "imported");
  toast("Added to your reviews as Pending. Click Approve to show it on the homepage.");
}

async function rejectSubmission(id) {
  if (reviewsReadOnly()) return;
  const ok = await ldConfirm({
    title: "Reject this submission?",
    body: "Remove this website submission. It won't be added to your reviews. This can't be undone.",
    confirmLabel: "Reject", danger: true
  });
  if (!ok) return;
  resolveSubmission(id, "rejected");
}

async function resolveSubmission(id, action) {
  try {
    const res = await fetch(REVIEW_SUB_API + "/resolve", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action })
    });
    await ldReadJson(res);
    loadReviewSubmissions();
  } catch (err) { toast(ldFriendlyError(err)); }
}

// Reviews are now served live from D1 by the Worker. Approve / hide / feature
// take effect on the homepage immediately — no publish, no deploy.
async function loadReviews() {
  try {
    const res = await fetch("/admin/api/reviews", { cache: "no-store", credentials: "same-origin" });
    const data = await ldReadJson(res);
    if (data.summary && Object.keys(data.summary).length) reviewsSummary = data.summary;
    state.reviews = (data.reviews || []).map((rev) => ({
      name: rev.name || "", initial: rev.initial || (rev.name || "?").charAt(0).toUpperCase(),
      rating: Number(rev.rating) || 5, treatment: rev.treatment || "",
      source: rev.source || "Client feedback", text: rev.text || "",
      status: rev.status || "pending", featured: rev.featured === true,
    }));
    renderReviewSummaryFields();
    renderReviews(); updateMetrics();
    saveDraft(null); // keep a local cache so the tab still opens if offline
  } catch (err) {
    // Fall back to whatever is cached locally.
    renderReviewSummaryFields();
    renderReviews();
    toast(ldFriendlyError(err));
  }
}
// Preserve the Treatwell summary (rating/count/label).
let reviewsSummary = { rating: "5.0", count: 47, label: "Treatwell reviews" };

// Full review set (all statuses) sent to the Worker, which stores it in D1 and
// serves only the approved ones (featured first) to the homepage.
function reviewsPayload() {
  return {
    summary: reviewsSummary,
    reviews: state.reviews.map((r) => ({
      name: r.name || "",
      initial: r.initial || (r.name || "?").charAt(0).toUpperCase(),
      rating: Number(r.rating) || 5,
      treatment: r.treatment || "",
      source: r.source || "Client feedback",
      text: r.text || "",
      status: r.status || "pending",
      featured: r.featured === true,
    })),
  };
}

let reviewSaveTimer = null;
// Debounced auto-save: every approve/hide/feature/edit persists to D1 and goes live.
function scheduleSaveReviews() {
  clearTimeout(reviewSaveTimer);
  setReviewSaveState("saving");
  reviewSaveTimer = setTimeout(saveReviewsNow, 700);
}
async function saveReviewsNow() {
  clearTimeout(reviewSaveTimer);
  try {
    const res = await fetch("/admin/api/reviews/save", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reviewsPayload()),
    });
    await ldReadJson(res);
    setReviewSaveState("saved");
    return true;
  } catch (err) {
    setReviewSaveState("error");
    toast(ldFriendlyError(err));
    return false;
  }
}
// Called from the review handlers instead of the old saveDraft/publish flow.
function persistReviews(message) {
  saveDraft(null);      // local cache + undo + metrics
  scheduleSaveReviews(); // live to the homepage
  if (message) toast(message);
}
// Reviews go live on save, so changing them is an owner-only action (the server
// enforces this too). Blocks assistants before any local change is made.
function reviewsReadOnly() {
  if (adminRole === "assistant") {
    toast("Owner access is required to change or publish reviews.");
    return true;
  }
  return false;
}

// Pull recent reviews from the clinic's Google Business listing and add the new
// ones to the queue as Pending (deduped). Needs the Google API key + Place ID set.
async function importGoogleReviews() {
  if (reviewsReadOnly()) return;
  toast("Checking Google for reviews…");
  let data;
  try {
    const res = await fetch("/admin/api/reviews/google", { cache: "no-store", credentials: "same-origin" });
    data = await ldReadJson(res);
  } catch (err) { toast(ldFriendlyError(err)); return; }
  if (!data.configured) {
    toast("Google reviews aren't connected yet — ask Dima to add the Google API key and Place ID.");
    return;
  }
  if (data.error) { toast("Google: " + data.error); return; }
  const fetched = data.reviews || [];
  if (!fetched.length) { toast("No Google reviews found to import."); return; }
  const key = (r) => String(r.name || "").trim().toLowerCase() + "|" + String(r.text || "").trim().toLowerCase().slice(0, 60);
  const existing = new Set(state.reviews.map(key));
  const fresh = fetched.filter((r) => !existing.has(key(r)));
  if (!fresh.length) { toast("All Google reviews are already in your queue."); return; }
  const ok = await ldConfirm({
    title: "Import " + fresh.length + " Google review" + (fresh.length > 1 ? "s" : "") + "?",
    body: "They'll be added to your queue as Pending (source: Google). Approve the ones you want to show on the homepage.",
    confirmLabel: "Import"
  });
  if (!ok) return;
  fresh.forEach((r) => state.reviews.unshift({
    name: r.name || "Google client", initial: (r.name || "G").charAt(0).toUpperCase(),
    rating: Number(r.rating) || 5, treatment: r.treatment || "", source: "Google",
    text: r.text || "", status: "pending", featured: false,
  }));
  renderReviews();
  persistReviews("Imported " + fresh.length + " Google review" + (fresh.length > 1 ? "s" : "") + " as Pending.");
}
function setReviewSaveState(state) {
  const btn = document.querySelector("[data-publish-reviews]");
  if (!btn) return;
  if (state === "saving") { btn.disabled = true; btn.textContent = "Saving…"; }
  else if (state === "saved") { btn.disabled = false; btn.textContent = "Saved ✓ — homepage is live"; setTimeout(() => { btn.textContent = "Save now"; }, 2200); }
  else if (state === "error") { btn.disabled = false; btn.textContent = "Save now"; }
}

// Reviews now save to D1 automatically and go live instantly. This button just
// flushes any pending auto-save immediately, for peace of mind.
async function publishReviews() {
  const ok = await saveReviewsNow();
  if (ok) toast("Saved — your reviews are live on the homepage now.");
  return ok;
}

function reviewFilterValue(sel) { const el = document.querySelector(sel); return el ? el.value : ""; }

function populateReviewSourceFilter() {
  const sel = document.querySelector("[data-review-source-filter]"); if (!sel) return;
  const cur = sel.value;
  const sources = Array.from(new Set(state.reviews.map((r) => (r.source || "").trim()).filter(Boolean))).sort();
  sel.innerHTML = '<option value="all">All sources</option>' + sources.map((s) => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("");
  sel.value = cur && sources.indexOf(cur) !== -1 ? cur : "all";
}

function updateReviewCounts() {
  const el = document.querySelector("[data-review-counts]"); if (!el) return;
  const approved = state.reviews.filter((r) => r.status === "approved").length;
  const pending = state.reviews.filter((r) => (r.status || "pending") === "pending").length;
  const hidden = state.reviews.filter((r) => r.status === "hidden").length;
  const featured = state.reviews.filter((r) => r.featured).length;
  el.textContent = state.reviews.length + " total · " + approved + " approved · " + featured + " featured · " + pending + " pending · " + hidden + " hidden";
}

function renderReviews() {
  const list = document.querySelector("[data-review-list]"); if (!list) return;
  populateReviewSourceFilter();
  updateReviewCounts();
  const status = reviewFilterValue("[data-review-filter]") || "all";
  const ratingF = reviewFilterValue("[data-review-rating-filter]") || "all";
  const sourceF = reviewFilterValue("[data-review-source-filter]") || "all";
  const q = (reviewFilterValue("[data-review-search]") || "").trim().toLowerCase();

  const filtered = state.reviews.filter((r) => {
    if (status === "featured") { if (!r.featured) return false; }
    else if (status !== "all") { if ((r.status || "pending") !== status) return false; }
    if (ratingF !== "all" && (Number(r.rating) || 0) < Number(ratingF)) return false;
    if (sourceF !== "all" && (r.source || "") !== sourceF) return false;
    if (q && ((r.name || "") + " " + (r.text || "") + " " + (r.treatment || "")).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });

  list.innerHTML = filtered.map((review) => {
    const i = state.reviews.indexOf(review);
    const st = review.status || "pending";
    const stars = "★".repeat(Math.max(1, Math.min(5, +review.rating || 5)));
    return `
      <article class="admin-review-item">
        <div class="review-body">
          <div class="review-meta">
            <strong>${escapeHtml(review.name || "Client")}</strong>
            <span class="review-stars">${stars}</span>
            <span class="status-pill status-${escapeHtml(st)}">${escapeHtml(st)}</span>
            ${review.featured ? '<span class="status-pill status-featured">featured</span>' : ""}
          </div>
          <p>${escapeHtml(review.text || "")}</p>
          <small>${escapeHtml(review.treatment || "Treatment")} · ${escapeHtml(review.source || "Client review")}</small>
        </div>
        <div class="review-actions">
          <button class="tiny-button" type="button" data-review-edit="${i}">Edit</button>
          <button class="tiny-button ${st === "approved" ? "" : "primary"}" type="button" data-review-action="${st === "approved" ? "pending" : "approved"}" data-review-index="${i}">${st === "approved" ? "Unapprove" : "Approve"}</button>
          <button class="tiny-button" type="button" data-review-action="featured" data-review-index="${i}">${review.featured ? "Unfeature" : "Feature"}</button>
          <button class="tiny-button" type="button" data-review-action="${st === "hidden" ? "pending" : "hidden"}" data-review-index="${i}">${st === "hidden" ? "Unhide" : "Hide"}</button>
          <button class="tiny-button danger" type="button" data-review-del="${i}">Delete</button>
        </div>
      </article>`;
  }).join("") || '<article class="admin-review-item"><p class="admin-help">No reviews match these filters.</p></article>';

  list.querySelectorAll("[data-review-action]").forEach((b) => b.addEventListener("click", () => {
    if (reviewsReadOnly()) return;
    const review = state.reviews[+b.dataset.reviewIndex]; if (!review) return;
    const action = b.dataset.reviewAction;
    if (action === "featured") {
      review.featured = !review.featured;
      // Featuring a review implies it should be visible.
      if (review.featured && review.status !== "approved") review.status = "approved";
    } else {
      review.status = action;
      // A hidden review can't also be featured.
      if (action === "hidden") review.featured = false;
    }
    renderReviews(); persistReviews(null);
  }));
  list.querySelectorAll("[data-review-edit]").forEach((b) => b.addEventListener("click", () => openReviewEditor(+b.dataset.reviewEdit)));
  list.querySelectorAll("[data-review-del]").forEach((b) => b.addEventListener("click", () => deleteReview(+b.dataset.reviewDel)));
}

async function deleteReview(index) {
  if (reviewsReadOnly()) return;
  const r = state.reviews[index]; if (!r) return;
  const ok = await ldConfirm({
    title: "Delete this review?",
    body: 'Permanently remove the review from "' + (r.name || "this client") + '". If it was live, it disappears from the homepage right away. This can\'t be undone.',
    confirmLabel: "Delete review",
    danger: true
  });
  if (!ok) return;
  state.reviews.splice(index, 1);
  renderReviews();
  persistReviews("Review deleted.");
}

// Modal form to add or edit a review's content.
function openReviewEditor(index) {
  const isNew = index == null || index < 0;
  const r = isNew
    ? { name: "", rating: 5, treatment: "", source: "Website", text: "", status: "pending", featured: false }
    : state.reviews[index];
  if (!r) return;
  const ratingOpts = [5, 4, 3, 2, 1].map((n) => '<option value="' + n + '">' + "★".repeat(n) + " (" + n + ")</option>").join("");
  const back = document.createElement("div");
  back.className = "ld-modal";
  back.innerHTML =
    '<div class="ld-modal-veil"></div>' +
    '<div class="ld-modal-card ld-modal-form" role="dialog" aria-modal="true">' +
      "<h3 class=\"ld-modal-title\">" + (isNew ? "Add review" : "Edit review") + "</h3>" +
      '<div class="admin-editor">' +
        "<label>Client name<input type=\"text\" data-rev-name></label>" +
        '<div class="field-pair">' +
          "<label>Rating<select data-rev-rating>" + ratingOpts + "</select></label>" +
          "<label>Treatment<input type=\"text\" data-rev-treatment placeholder=\"e.g. Laser hair removal\"></label>" +
        "</div>" +
        "<label>Source<input type=\"text\" data-rev-source placeholder=\"e.g. Treatwell, Google, In person\"></label>" +
        "<label>Review text<textarea rows=\"4\" data-rev-text></textarea></label>" +
        '<label class="admin-check"><input type="checkbox" data-rev-featured> Feature this review (shows first on the homepage)</label>' +
      "</div>" +
      '<div class="ld-modal-actions">' +
        '<button class="admin-button admin-button-secondary" type="button" data-rev-cancel>Cancel</button>' +
        '<button class="admin-button admin-button-primary" type="button" data-rev-save>' + (isNew ? "Add review" : "Save changes") + "</button>" +
      "</div>" +
    "</div>";
  const q = (s) => back.querySelector(s);
  q("[data-rev-name]").value = r.name || "";
  q("[data-rev-rating]").value = String(r.rating || 5);
  q("[data-rev-treatment]").value = r.treatment || "";
  q("[data-rev-source]").value = r.source || "";
  q("[data-rev-text]").value = r.text || "";
  q("[data-rev-featured]").checked = r.featured === true;
  function close() { back.classList.remove("is-open"); document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); setTimeout(() => back.remove(), 160); }
  function onKey(e) { if (e.key === "Escape") close(); }
  q(".ld-modal-veil").addEventListener("click", close);
  q("[data-rev-cancel]").addEventListener("click", close);
  q("[data-rev-save]").addEventListener("click", () => {
    if (reviewsReadOnly()) return;
    const name = q("[data-rev-name]").value.trim();
    if (!name) { toast("Add the client's name first."); return; }
    const updated = {
      name,
      initial: name.charAt(0).toUpperCase(),
      rating: parseInt(q("[data-rev-rating]").value, 10) || 5,
      treatment: q("[data-rev-treatment]").value.trim(),
      source: q("[data-rev-source]").value.trim() || "Client feedback",
      text: q("[data-rev-text]").value.trim(),
      featured: q("[data-rev-featured]").checked,
      status: isNew ? "pending" : (r.status || "pending"),
    };
    // Featured implies visible; never leave a featured review hidden.
    if (updated.featured && updated.status === "hidden") updated.status = "approved";
    if (isNew) state.reviews.unshift(updated);
    else state.reviews[index] = { ...r, ...updated };
    renderReviews();
    persistReviews(isNew ? "Review added (pending — approve it to show on the homepage)." : "Review updated.");
    close();
  });
  (document.querySelector(".admin-main") || document.body).appendChild(back);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => { back.classList.add("is-open"); const n = q("[data-rev-name]"); if (n) n.focus(); });
}

/* ---------------- Pages (hero copy + contact details) ----------------
   Homepage hero is rendered from content.json between the HERO markers in
   index.html. Contact details are stored in content.json and, on publish,
   replaced (exact-string) everywhere they appear across the site. */
const CONTACT_KEYS = ["phone", "email", "address", "instagramUrl", "instagramHandle", "facebookUrl", "facebookHandle"];

// Current live values on the site (used as fallback if content.json is missing).
const DEFAULT_CONTENT = {
  seo: {
    title: "Lumi Derm Aesthetics | Advanced Beauty & Skin Treatments",
    description: "Lumi Derm Aesthetics offers laser treatments, electrolysis, Endospheres therapy, PRP, skin boosters, facials, peels, microneedling, exosomes, lashes and brows."
  },
  hero: {
    eyebrow: "Lumi Derm Aesthetics &middot; London Docklands",
    title: "Skin confidence,<br>made personal.",
    lead: "Advanced skin, laser and body treatments designed around your goals, your skin and your lifestyle &mdash; delivered with calm, expert-led care."
  },
  faq: [],
  contact: {
    phone: "07832839298",
    email: "info@lumidermaesthetics.co.uk",
    address: "Unit 41 Skylines Village, Limeharbour, London, E14 9TS",
    instagramUrl: "https://www.instagram.com/lumi.derm.aesthetic/",
    instagramHandle: "@lumi.derm.aesthetic",
    facebookUrl: "https://www.facebook.com/LumiDerm",
    facebookHandle: "LumiDerm"
  },
  pages: {
    about: {
      hero: {
        eyebrow: "About Lumi Derm",
        title: "Professional aesthetic care, carefully delivered.",
        lead: "Advanced skin, laser and body treatments planned around your concerns, with clear advice and a calm clinical approach."
      },
      bio: {
        eyebrow: "About the clinic",
        title: "Clinically minded care, delivered calmly",
        paragraphs: [
          "Lumi Derm Aesthetics offers advanced skincare in a calm, professional setting. Treatments are planned carefully and delivered with technology and products chosen for safety, quality and results.",
          "Every appointment begins with a real conversation. We take time to understand your skin, your concerns and your goals, then recommend what is likely to help and what is worth leaving alone.",
          "The aim is to support healthier-looking skin, soften what bothers you and help you feel more comfortable in your own skin."
        ],
        signature: "the practitioner",
        role: "Founder & Lead Practitioner, Lumi Derm Aesthetics",
        image: {
          src: "../assets/images/lumi-derm-practitioner-about.webp",
          alt: "The lead aesthetic practitioner at Lumi Derm Aesthetics",
          width: "1200",
          height: "1500"
        }
      },
      clinic: {
        eyebrow: "The clinic",
        title: "A quiet Docklands studio for skin, laser and body care",
        lead: "Lumi Derm Aesthetics is a private treatment space in London Docklands. The approach is simple: understand the concern, explain the options clearly, and keep each appointment focused on the client.",
        cards: [
          { title: "What the clinic offers", copy: "Facials, chemical peels, skin boosters, mesotherapy, PRP, laser hair removal, vascular laser treatments, electrolysis for hair and blemish removal, lymphatic drainage and Endospheres therapy." },
          { title: "What matters", copy: "Appointments are one-to-one, treatment plans are tailored, and product choices are considered carefully." }
        ],
        image: {
          src: "../assets/images/about-lumi-derm-studio.webp",
          alt: "Lumi Derm Aesthetics treatment studio in London Docklands"
        }
      },
      stats: [
        { num: "10+", label: "Years' experience" },
        { num: "5.0★", label: "From 47 reviews" },
        { num: "16", label: "Advanced treatments" },
        { num: "E14", label: "London Docklands" }
      ],
      concerns: {
        eyebrow: "How the clinic can help",
        title: "The concerns we can help with",
        copy: "Most clients come in with something specific they want to improve: hair growth, texture, dullness, redness, thinning hair, puffiness or skin that no longer feels like theirs. These are the concerns treated most often.",
        items: [
          { chip: "Unwanted hair", title: "Endless shaving, waxing & ingrown hairs", copy: "Constant regrowth, irritation and ingrowns are exhausting to manage. Treatments reduce hair long-term — and permanently where suitable.", helpLabel: "How it helps:", help: "Cynosure Elite laser & Apilus electrolysis" },
          { chip: "Dull & tired skin", title: "Skin that's lost its glow", copy: "Dullness, rough texture and congestion can make skin look tired. We resurface, brighten and rebalance with treatments chosen around your skin tolerance.", helpLabel: "How it helps:", help: "Facials, peels & microneedling" },
          { chip: "Lines & firmness", title: "Early lines & loss of firmness", copy: "As collagen slows, skin can feel less bouncy and defined. Hydration and bio-remodelling treatments support smoother, fresher-looking skin.", helpLabel: "How it helps:", help: "Profhilo, polynucleotides & skin boosters" },
          { chip: "Tone & redness", title: "Pigmentation, redness & thread veins", copy: "Uneven tone, sun spots and visible vessels can be distracting. Suitable concerns are targeted carefully, with patch tests and realistic expectations.", helpLabel: "How it helps:", help: "Laser skin rejuvenation & vascular" },
          { chip: "Hair loss", title: "Thinning hair & shedding", copy: "Noticing more scalp or slower growth? Regenerative treatments can nourish the follicles and support stronger, fuller hair.", helpLabel: "How it helps:", help: "PRP, mesotherapy & polynucleotides" },
          { chip: "Puffiness & contour", title: "Puffiness & sluggish circulation", copy: "Fluid retention and heaviness can affect how the face and body feel. Drainage-focused treatments support a lighter, smoother appearance.", helpLabel: "How it helps:", help: "Endospheres therapy & body treatments" }
        ]
      },
      treatments: {
        eyebrow: "What the clinic offers",
        title: "Advanced treatments, planned with restraint",
        copy: "The clinic offers laser, regenerative, skin and body treatments, but the plan stays focused: what is useful, what is safe, and what makes sense for your skin."
      },
      benefits: {
        eyebrow: "Advice based on your concern",
        title: "We only recommend what is right for you",
        copy: "",
        items: [
          { icon: "consultation", title: "Consultation first", copy: "Every plan starts with your suitability, goals and realistic expectations — not a hard sell." },
          { icon: "shield", title: "Honest advice", copy: "We only recommend what will genuinely help you, and we will always tell you if something is not right." },
          { icon: "star", title: "Results that look like you", copy: "Natural-looking outcomes that refresh and support your features without making treatment the first thing people notice." },
          { icon: "safety", title: "Safety first", copy: "To ensure your safety, patch tests are required for certain treatments." },
          { icon: "plan", title: "Tailored plans & courses", copy: "Personalised treatment plans built around your concerns." },
          { icon: "studio", title: "Calm, private studio", copy: "Relaxed one-to-one appointments in a modern Docklands studio, close to South Quay and Crossharbour." }
        ]
      },
      journey: {
        eyebrow: "What to expect",
        title: "Carefully tailored treatments",
        copy: "",
        steps: [
          { number: "1", title: "Consultation", copy: "We talk through your skin, goals and suitability — with a patch test if your treatment needs one." },
          { number: "2", title: "Your plan", copy: "We build a personalised plan with clear expectations and timings." },
          { number: "3", title: "Treatment", copy: "Carefully tailored treatments using medical-grade, trusted technology." },
          { number: "4", title: "Aftercare & results", copy: "Clear aftercare to protect your results, with reviews along the way to keep you on track." }
        ]
      },
      cta: {
        title: "Ready when you are",
        copy: "Book a consultation and we'll build a plan around your concerns."
      }
    },
    services: {
      hero: {
        eyebrow: "Treatment menu & prices",
        title: "Treatments & prices",
        lead: "Start with the treatment group that matches your concern. Laser hair removal, skin laser, vascular laser, electrolysis, body sculpting, lashes and brows are separated so each first step is easier to find."
      }
    },
    booking: {
      hero: {
        eyebrow: "Online booking",
        title: "Book your appointment"
      },
      picker: {
        eyebrow: "Treatment booking",
        title: "Choose a treatment",
        copy: "Select a category, then tap a treatment card."
      },
      widget: {
        eyebrow: "Live booking",
        title: "Choose your time on the Treatwell calendar",
        copy: "Select the same treatment in the widget menu, then choose your appointment time and confirm securely without leaving this page."
      },
      support: {
        title: "Not sure what to choose?",
        copy: "Book a consultation or message Lumi Derm before selecting a treatment."
      }
    }
  }
};

function contentReady() { return state.content && state.content.hero && state.content.contact; }
function aboutArray(data, key, fallback) {
  return Array.isArray(data && data.pages && data.pages.about && data.pages.about[key])
    ? data.pages.about[key]
    : structuredClone(fallback || []);
}
function aboutNestedArray(data, section, key, fallback) {
  return Array.isArray(data && data.pages && data.pages.about && data.pages.about[section] && data.pages.about[section][key])
    ? data.pages.about[section][key]
    : structuredClone(fallback || []);
}
function mergeContent(data) {
  return {
    seo: { ...DEFAULT_CONTENT.seo, ...(data && data.seo ? data.seo : {}) },
    hero: { ...DEFAULT_CONTENT.hero, ...(data && data.hero ? data.hero : {}) },
    contact: { ...DEFAULT_CONTENT.contact, ...(data && data.contact ? data.contact : {}) },
    faq: Array.isArray(data && data.faq) ? data.faq.map((it) => ({ q: String((it && it.q) || ""), a: String((it && it.a) || "") })) : (DEFAULT_CONTENT.faq || []).slice(),
    pages: {
      about: {
        ...DEFAULT_CONTENT.pages.about,
        ...(data && data.pages && data.pages.about ? data.pages.about : {}),
        hero: { ...DEFAULT_CONTENT.pages.about.hero, ...(data && data.pages && data.pages.about && data.pages.about.hero ? data.pages.about.hero : {}) },
        bio: {
          ...DEFAULT_CONTENT.pages.about.bio,
          ...(data && data.pages && data.pages.about && data.pages.about.bio ? data.pages.about.bio : {}),
          image: { ...DEFAULT_CONTENT.pages.about.bio.image, ...(data && data.pages && data.pages.about && data.pages.about.bio && data.pages.about.bio.image ? data.pages.about.bio.image : {}) }
        },
        clinic: {
          ...DEFAULT_CONTENT.pages.about.clinic,
          ...(data && data.pages && data.pages.about && data.pages.about.clinic ? data.pages.about.clinic : {}),
          cards: aboutNestedArray(data, "clinic", "cards", DEFAULT_CONTENT.pages.about.clinic.cards),
          image: { ...DEFAULT_CONTENT.pages.about.clinic.image, ...(data && data.pages && data.pages.about && data.pages.about.clinic && data.pages.about.clinic.image ? data.pages.about.clinic.image : {}) }
        },
        stats: aboutArray(data, "stats", DEFAULT_CONTENT.pages.about.stats),
        concerns: {
          ...DEFAULT_CONTENT.pages.about.concerns,
          ...(data && data.pages && data.pages.about && data.pages.about.concerns ? data.pages.about.concerns : {}),
          items: aboutNestedArray(data, "concerns", "items", DEFAULT_CONTENT.pages.about.concerns.items)
        },
        treatments: { ...DEFAULT_CONTENT.pages.about.treatments, ...(data && data.pages && data.pages.about && data.pages.about.treatments ? data.pages.about.treatments : {}) },
        benefits: {
          ...DEFAULT_CONTENT.pages.about.benefits,
          ...(data && data.pages && data.pages.about && data.pages.about.benefits ? data.pages.about.benefits : {}),
          items: aboutNestedArray(data, "benefits", "items", DEFAULT_CONTENT.pages.about.benefits.items)
        },
        journey: {
          ...DEFAULT_CONTENT.pages.about.journey,
          ...(data && data.pages && data.pages.about && data.pages.about.journey ? data.pages.about.journey : {}),
          steps: aboutNestedArray(data, "journey", "steps", DEFAULT_CONTENT.pages.about.journey.steps)
        },
        cta: { ...DEFAULT_CONTENT.pages.about.cta, ...(data && data.pages && data.pages.about && data.pages.about.cta ? data.pages.about.cta : {}) }
      },
      services: {
        ...DEFAULT_CONTENT.pages.services,
        ...(data && data.pages && data.pages.services ? data.pages.services : {}),
        hero: { ...DEFAULT_CONTENT.pages.services.hero, ...(data && data.pages && data.pages.services && data.pages.services.hero ? data.pages.services.hero : {}) }
      },
      booking: {
        ...DEFAULT_CONTENT.pages.booking,
        ...(data && data.pages && data.pages.booking ? data.pages.booking : {}),
        hero: { ...DEFAULT_CONTENT.pages.booking.hero, ...(data && data.pages && data.pages.booking && data.pages.booking.hero ? data.pages.booking.hero : {}) },
        picker: { ...DEFAULT_CONTENT.pages.booking.picker, ...(data && data.pages && data.pages.booking && data.pages.booking.picker ? data.pages.booking.picker : {}) },
        widget: { ...DEFAULT_CONTENT.pages.booking.widget, ...(data && data.pages && data.pages.booking && data.pages.booking.widget ? data.pages.booking.widget : {}) },
        support: { ...DEFAULT_CONTENT.pages.booking.support, ...(data && data.pages && data.pages.booking && data.pages.booking.support ? data.pages.booking.support : {}) }
      }
    }
  };
}

function bindContent() {
  document.querySelector("[data-reload-content]")?.addEventListener("click", async () => {
    const ok = await ldConfirm({
      title: "Reload live page text?",
      body: "This replaces the local page-text draft in this browser with what is currently on the website. You can use Undo local edit straight after if needed.",
      confirmLabel: "Reload live text"
    });
    if (!ok) return;
    recordDraftVersion("content", "Before reloading live page text", state.content);
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
  document.querySelectorAll("[data-content-seo]").forEach((f) => f.addEventListener("change", () => {
    if (!state.content.seo) state.content.seo = {};
    state.content.seo[f.dataset.contentSeo] = escapeHtml(f.value.trim());
    saveDraft("SEO detail updated.");
  }));
  document.querySelectorAll("[data-content-page]").forEach((f) => f.addEventListener("change", () => {
    setContentPath(f.dataset.contentPage, escapeHtml(f.value.trim()));
    saveDraft("Page text updated.");
  }));
  document.querySelectorAll("[data-content-list]").forEach((f) => f.addEventListener("change", () => {
    setContentPath(f.dataset.contentList, paragraphList(f.value));
    saveDraft("Page text updated.");
  }));
  document.querySelectorAll("[data-about-add]").forEach((btn) => btn.addEventListener("click", () => {
    addAboutItem(btn.dataset.aboutAdd);
  }));
}

async function loadContentFromJson(announce, force) {
  try {
    // Read the live page text from D1 (what publishes now write to), falling back
    // to the static content.json file when D1 is empty. Mirrors how prices load.
    const r = await fetch("/admin/api/content", { cache: "no-store", credentials: "same-origin" });
    if (r.ok) {
      const data = await r.json();
      const live = mergeContent((data && data.content) || DEFAULT_CONTENT);
      if (force || !contentReady()) {
        state.content = structuredClone(live);
        saveDraft(announce ? "Loaded the text currently on the website." : null);
      }
    } else if (force || !contentReady()) {
      state.content = mergeContent(DEFAULT_CONTENT);
      saveDraft(null);
    }
  } catch {
    if (!contentReady()) state.content = mergeContent(DEFAULT_CONTENT);
    if (announce) toast("Could not read the website's text.");
  }
  renderContent();
}

function renderContent() {
  state.content = mergeContent(state.content || {});
  const c = state.content || {};
  const hero = c.hero || {}, contact = c.contact || {}, seo = c.seo || {};
  const setVal = (sel, val) => { const el = document.querySelector(sel); if (el) el.value = val; };
  setVal('[data-content-seo="title"]', decodeHtml(seo.title || ""));
  setVal('[data-content-seo="description"]', decodeHtml(seo.description || ""));
  setVal('[data-content-hero="eyebrow"]', decodeHtml(hero.eyebrow || ""));
  setVal('[data-content-hero="title"]', decodeHtml(String(hero.title || "").replace(/<br\s*\/?>/gi, "\n")));
  setVal('[data-content-hero="lead"]', decodeHtml(hero.lead || ""));
  CONTACT_KEYS.forEach((k) => setVal(`[data-content-contact="${k}"]`, decodeHtml(contact[k] || "")));
  document.querySelectorAll("[data-content-page]").forEach((f) => {
    setVal(`[data-content-page="${f.dataset.contentPage}"]`, decodeHtml(getContentPath(f.dataset.contentPage) || ""));
  });
  document.querySelectorAll("[data-content-list]").forEach((f) => {
    const list = getContentPath(f.dataset.contentList);
    setVal(`[data-content-list="${f.dataset.contentList}"]`, (Array.isArray(list) ? list : []).map(decodeHtml).join("\n\n"));
  });
  renderAboutDynamicEditors();
  renderFaq();
}

function setContentStatus(message) {
  const el = document.querySelector("[data-content-status]"); if (el) el.textContent = message;
}

function aboutList(kind) {
  state.content = mergeContent(state.content || {});
  const about = state.content.pages.about;
  if (kind === "stats") return about.stats;
  if (kind === "concerns") return about.concerns.items;
  if (kind === "benefits") return about.benefits.items;
  if (kind === "journey") return about.journey.steps;
  return [];
}

function createAboutItem(kind) {
  if (kind === "stats") return { num: "New", label: "Stat label" };
  if (kind === "concerns") return { chip: "Concern", title: "New concern", copy: "Describe the concern.", helpLabel: "How it helps:", help: "Relevant treatments" };
  if (kind === "benefits") return { icon: "star", title: "New benefit", copy: "Describe the client benefit." };
  if (kind === "journey") return { number: "", title: "New step", copy: "Describe this step." };
  return {};
}

function aboutFields(kind) {
  if (kind === "stats") return [["num", "Number"], ["label", "Label"]];
  if (kind === "concerns") return [["chip", "Chip"], ["title", "Title"], ["copy", "Copy", "textarea"], ["helpLabel", "Help label"], ["help", "Treatment/help text"]];
  if (kind === "benefits") return [["icon", "Icon"], ["title", "Title"], ["copy", "Copy", "textarea"]];
  if (kind === "journey") return [["number", "Number"], ["title", "Title"], ["copy", "Copy", "textarea"]];
  return [];
}

function renderAboutDynamicEditors() {
  ["stats", "concerns", "benefits", "journey"].forEach((kind) => {
    const box = document.querySelector(`[data-about-list="${kind}"]`);
    if (!box) return;
    const list = aboutList(kind);
    if (!list.length) {
      box.innerHTML = '<p class="admin-help">No items yet.</p>';
      return;
    }
    box.innerHTML = list.map((item, index) => {
      const fields = aboutFields(kind).map(([key, label, type]) => {
        const value = escapeAttr(decodeHtml(item[key] || ""));
        if (type === "textarea") {
          return `<label>${label}<textarea rows="3" data-about-field="${kind}:${index}:${key}">${escapeHtml(decodeHtml(item[key] || ""))}</textarea></label>`;
        }
        return `<label>${label}<input type="text" value="${value}" data-about-field="${kind}:${index}:${key}"></label>`;
      }).join("");
      return `
        <article class="content-repeat-item">
          <div class="content-repeat-item-head">
            <strong>${escapeHtml((item.title || item.label || item.num || "Item").toString())}</strong>
            <div class="price-inline-actions">
              <button class="tiny-button" type="button" data-about-action="up" data-about-kind="${kind}" data-about-index="${index}" ${index === 0 ? "disabled" : ""}>Move up</button>
              <button class="tiny-button" type="button" data-about-action="down" data-about-kind="${kind}" data-about-index="${index}" ${index >= list.length - 1 ? "disabled" : ""}>Move down</button>
              <button class="tiny-button danger" type="button" data-about-action="delete" data-about-kind="${kind}" data-about-index="${index}">Delete</button>
            </div>
          </div>
          <div class="content-repeat-fields">${fields}</div>
        </article>`;
    }).join("");
    box.querySelectorAll("[data-about-field]").forEach((field) => field.addEventListener("change", () => {
      const [fieldKind, rawIndex, key] = field.dataset.aboutField.split(":");
      const row = aboutList(fieldKind)[Number(rawIndex)];
      if (!row) return;
      row[key] = escapeHtml(field.value.trim());
      saveDraft("About page item updated.");
      renderAboutDynamicEditors();
    }));
    box.querySelectorAll("[data-about-action]").forEach((btn) => btn.addEventListener("click", async () => {
      const kind = btn.dataset.aboutKind;
      const index = Number(btn.dataset.aboutIndex);
      const list = aboutList(kind);
      if (!list[index]) return;
      if (btn.dataset.aboutAction === "delete") {
        const ok = await ldConfirm({ title: "Delete this About item?", body: "This removes it from the About page draft. It will not affect the live site until you publish.", confirmLabel: "Delete", danger: true });
        if (!ok) return;
        list.splice(index, 1);
      } else {
        const dir = btn.dataset.aboutAction === "up" ? -1 : 1;
        const to = index + dir;
        if (to < 0 || to >= list.length) return;
        [list[index], list[to]] = [list[to], list[index]];
      }
      saveDraft("About page item updated.");
      renderAboutDynamicEditors();
    }));
  });
}

function addAboutItem(kind) {
  const list = aboutList(kind);
  list.push(createAboutItem(kind));
  saveDraft("About page item added.");
  renderAboutDynamicEditors();
}

/* ---------------- FAQ (homepage) ---------------- */
// Editable homepage FAQ. Stored in content.json under `faq: [{q, a}]`, where the
// answer is trusted HTML (may contain links). Publishing regenerates both the
// visible accordion and the FAQPage structured data, and keeps the CSP JSON-LD
// hash in _headers in sync.
let faqDragFrom = null;
const FAQ_INDEX_REPO_PATH = "lumi-derm-website/index.html";
const FAQ_LIST_MARKERS = /(<!-- FAQ:START[\s\S]*?-->)[\s\S]*?(<!-- FAQ:END -->)/;
const FAQ_JSONLD_RE = /\{\s*"@type":\s*"FAQPage"[\s\S]*?\}(?=\s*\]\s*\}\s*<\/script>)/;

function faqList() {
  if (!state.content) state.content = mergeContent({});
  if (!Array.isArray(state.content.faq)) state.content.faq = [];
  return state.content.faq;
}

// Answer HTML <-> friendly editor text (paragraphs separated by blank lines).
function faqHtmlToText(a) {
  return decodeHtml(
    String(a || "")
      .replace(/<\/p>\s*<p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?p>/gi, "")
      .trim()
  );
}
function faqTextToHtml(t) {
  const blocks = String(t || "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b) => "<p>" + b.replace(/\n/g, "<br>") + "</p>").join("");
}

function setFaqStatus(message) {
  const el = document.querySelector("[data-faq-status]"); if (el) el.textContent = message;
}

function bindFaq() {
  document.querySelector("[data-faq-add]")?.addEventListener("click", () => {
    faqList().push({ q: "", a: "" });
    saveDraft(null);
    renderFaq();
    const cards = document.querySelectorAll("[data-faq-editor] [data-faq-index]");
    cards[cards.length - 1]?.querySelector("[data-faq-q]")?.focus();
  });
  document.querySelector("[data-faq-reload]")?.addEventListener("click", () => loadContentFromJson(true, true));
  document.querySelector("[data-faq-publish]")?.addEventListener("click", publishFaq);
}

function renderFaq() {
  renderFaqEditor();
  renderFaqPreview();
}

function updateFaqCount() {
  const el = document.querySelector("[data-faq-count]");
  if (!el) return;
  const n = faqList().length;
  el.textContent = n + " question" + (n === 1 ? "" : "s");
}

function renderFaqEditor() {
  const host = document.querySelector("[data-faq-editor]");
  if (!host) return;
  const items = faqList();
  updateFaqCount();
  if (!items.length) {
    host.innerHTML = '<div class="faq-empty">No questions yet. Click <strong>Add question</strong> to create your first one.</div>';
    return;
  }
  host.innerHTML = items.map((it, i) => {
    const q = escapeHtml(decodeHtml(it.q || ""));
    const a = escapeHtml(faqHtmlToText(it.a || ""));
    return '<article class="faq-edit-card" data-faq-index="' + i + '">' +
      '<div class="faq-edit-head">' +
        '<span class="faq-drag" data-faq-handle title="Drag to reorder">⋮⋮</span>' +
        '<span class="faq-edit-num">' + (i + 1) + "</span>" +
        '<span class="faq-edit-actions">' +
          '<button class="faq-icon-btn" type="button" data-faq-up ' + (i === 0 ? "disabled" : "") + ' title="Move up" aria-label="Move up">↑</button>' +
          '<button class="faq-icon-btn" type="button" data-faq-down ' + (i === items.length - 1 ? "disabled" : "") + ' title="Move down" aria-label="Move down">↓</button>' +
          '<button class="faq-icon-btn faq-del" type="button" data-faq-del title="Delete" aria-label="Delete question">✕</button>' +
        "</span>" +
      "</div>" +
      "<label>Question<input type=\"text\" data-faq-q value=\"" + q + "\" placeholder=\"e.g. Do you offer packages?\"></label>" +
      "<label>Answer <small>you can add a link</small><textarea rows=\"3\" data-faq-a placeholder=\"Write a short, friendly answer.\">" + a + "</textarea></label>" +
      '<div class="faq-answer-tools"><button class="faq-mini-btn" type="button" data-faq-link>Insert link</button></div>' +
    "</article>";
  }).join("");
  bindFaqCards();
}

function bindFaqCards() {
  const host = document.querySelector("[data-faq-editor]");
  if (!host) return;
  host.querySelectorAll("[data-faq-index]").forEach((card) => {
    const i = Number(card.dataset.faqIndex);
    card.querySelector("[data-faq-q]")?.addEventListener("input", (e) => { faqList()[i].q = e.target.value; saveDraft(null); renderFaqPreview(); });
    card.querySelector("[data-faq-a]")?.addEventListener("input", (e) => { faqList()[i].a = faqTextToHtml(e.target.value); saveDraft(null); renderFaqPreview(); });
    card.querySelector("[data-faq-up]")?.addEventListener("click", () => moveFaq(i, -1));
    card.querySelector("[data-faq-down]")?.addEventListener("click", () => moveFaq(i, 1));
    card.querySelector("[data-faq-del]")?.addEventListener("click", () => deleteFaq(i));
    card.querySelector("[data-faq-link]")?.addEventListener("click", () => insertFaqLink(card, i));
    bindFaqDrag(card, i);
  });
}

function moveFaq(i, dir) {
  const items = faqList();
  const j = i + dir;
  if (j < 0 || j >= items.length) return;
  const [it] = items.splice(i, 1);
  items.splice(j, 0, it);
  saveDraft(null); renderFaq();
}

async function deleteFaq(i) {
  const items = faqList();
  const label = decodeHtml(items[i] && items[i].q ? items[i].q : "this question");
  const ok = await ldConfirm({
    title: "Delete this question?",
    body: "“" + label + "” will be removed from the editor. It only leaves your website when you next publish.",
    confirmLabel: "Delete question"
  });
  if (!ok) return;
  items.splice(i, 1);
  saveDraft(null); renderFaq();
}

function insertFaqLink(card, i) {
  const ta = card.querySelector("[data-faq-a]");
  if (!ta) return;
  const url = window.prompt("Link address (https://…, tel: or mailto:)", "https://");
  if (!url) return;
  const start = ta.selectionStart, end = ta.selectionEnd;
  const sel = ta.value.slice(start, end) || "link text";
  const link = '<a href="' + url.trim() + '">' + sel + "</a>";
  ta.value = ta.value.slice(0, start) + link + ta.value.slice(end);
  faqList()[i].a = faqTextToHtml(ta.value);
  saveDraft(null); renderFaqPreview();
  ta.focus();
}

function bindFaqDrag(card, i) {
  const handle = card.querySelector("[data-faq-handle]");
  if (handle) {
    handle.addEventListener("mousedown", () => card.setAttribute("draggable", "true"));
    handle.addEventListener("touchstart", () => card.setAttribute("draggable", "true"), { passive: true });
  }
  const clearDraggable = () => card.removeAttribute("draggable");
  card.addEventListener("dragstart", (e) => {
    faqDragFrom = i;
    card.classList.add("is-dragging");
    try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); } catch { /* ignore */ }
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("is-dragging");
    document.querySelectorAll(".faq-edit-card.is-drop-target").forEach((c) => c.classList.remove("is-drop-target"));
    faqDragFrom = null;
    clearDraggable();
  });
  card.addEventListener("dragover", (e) => { e.preventDefault(); card.classList.add("is-drop-target"); try { e.dataTransfer.dropEffect = "move"; } catch { /* ignore */ } });
  card.addEventListener("dragleave", () => card.classList.remove("is-drop-target"));
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    card.classList.remove("is-drop-target");
    const from = faqDragFrom, to = i;
    if (from == null || from === to) { clearDraggable(); return; }
    const items = faqList();
    const [it] = items.splice(from, 1);
    items.splice(to, 0, it);
    saveDraft(null); renderFaq();
  });
}

function renderFaqPreview() {
  const host = document.querySelector("[data-faq-preview]");
  if (!host) return;
  const items = faqList().filter((it) => String(it.q || "").trim());
  if (!items.length) {
    host.innerHTML = '<p class="admin-hint">Your questions will appear here as you add them.</p>';
    return;
  }
  host.innerHTML = items.map((it, i) =>
    '<div class="faq-preview-row' + (i === 0 ? " is-open" : "") + '" data-faq-prow>' +
      '<button class="faq-preview-q" type="button" data-faq-ptoggle>' + escapeHtml(decodeHtml(it.q)) + "</button>" +
      '<div class="faq-preview-a"><div>' + (it.a || "") + "</div></div>" +
    "</div>"
  ).join("");
  host.querySelectorAll("[data-faq-ptoggle]").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest("[data-faq-prow]")?.classList.toggle("is-open"));
  });
}

async function publishFaq() {
  if (!ghReady) { toast("Publishing isn't set up on the server yet — ask Dima."); return false; }
  if (typeof window.renderFaqRows !== "function" || typeof window.renderFaqJsonLd !== "function") {
    toast("Page template didn’t load — hard-refresh the admin and try again."); return false;
  }
  const raw = faqList();
  const clean = raw
    .map((it) => ({ q: String(it.q || "").trim(), a: String(it.a || "").trim() }))
    .filter((it) => it.q && it.a);
  if (!clean.length) {
    setFaqStatus("Nothing to publish yet — add a question and an answer.");
    toast("Add at least one question with an answer before publishing.");
    return false;
  }

  const btn = document.querySelector("[data-faq-publish]");
  if (btn) { btn.disabled = true; btn.textContent = "Publishing…"; }
  setFaqStatus("Publishing FAQ…");
  recordDraftVersion("content", "Before publishing FAQ", state.content);
  try {
    // content.json — replace only the faq key, preserving the rest of the page text.
    let json = {};
    const cur = await ghRequest(CONTENT_REPO_PATH + "?ref=main&_=" + Date.now(), { method: "GET" });
    if (cur.ok) { try { json = JSON.parse(decodeB64((await cur.json()).content)); } catch { json = {}; } }
    else if (cur.status !== 404) { const e = await cur.json().catch(() => ({})); throw new Error(ghError(cur.status, e.message)); }
    const prevFaq = JSON.stringify(Array.isArray(json.faq) ? json.faq : []);
    json.faq = clean;
    const faqDataChanged = prevFaq !== JSON.stringify(clean);

    // index.html — visible accordion rows + FAQPage structured data. The Worker
    // recomputes the CSP hash for us, so we never touch _headers here.
    const before = await ghReadRepoFile(FAQ_INDEX_REPO_PATH);
    if (!FAQ_LIST_MARKERS.test(before)) throw new Error("The FAQ markers weren’t found on the homepage — ask Dima to check index.html.");
    let out = before.replace(FAQ_LIST_MARKERS, (m, p1, p2) => p1 + "\n" + window.renderFaqRows(clean) + "\n              " + p2);
    if (FAQ_JSONLD_RE.test(out)) out = out.replace(FAQ_JSONLD_RE, () => window.renderFaqJsonLd(clean));
    const indexChanged = out !== before;

    if (!faqDataChanged && !indexChanged) {
      resetContentBaseline(state.content);
      setFaqStatus("Already up to date — nothing changed since the last publish.");
      toast("FAQ already matches the website.");
      return true;
    }

    const files = [{ path: CONTENT_REPO_PATH, content: JSON.stringify(json, null, 2) + "\n" }];
    if (indexChanged) files.push({ path: FAQ_INDEX_REPO_PATH, content: out });

    // One atomic commit; the Worker adds/patches _headers if the JSON-LD changed.
    await ghPublishFiles(files, "Update FAQ (via admin)");

    state.content.faq = clean;
    resetContentBaseline(state.content);
    setFaqStatus("Published in one commit. Tracking the deploy in Settings → Latest publish & deploy.");
    startDeployWatch();
    toast("FAQ published — deploying now. You'll get a note when it's live.");
    return true;
  } catch (err) {
    setFaqStatus("Publish failed: " + ldFriendlyError(err));
    toast("Publish failed: " + ldFriendlyError(err));
    return false;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Publish FAQ"; }
  }
}

function getContentPath(path) {
  return String(path || "").split(".").reduce((obj, key) => (obj && obj[key] != null ? obj[key] : undefined), state.content);
}

function setContentPath(path, value) {
  const keys = String(path || "").split(".").filter(Boolean);
  if (!keys.length) return;
  if (!state.content) state.content = {};
  let target = state.content;
  keys.slice(0, -1).forEach((key) => {
    if (!target[key] || typeof target[key] !== "object") target[key] = {};
    target = target[key];
  });
  target[keys[keys.length - 1]] = value;
}

function paragraphList(value) {
  return String(value || "").split(/\n\s*\n/).map((p) => escapeHtml(p.trim())).filter(Boolean);
}

/* ---------------- Settings ---------------- */
function bindSettings() {
  document.querySelector("[data-save-pass]")?.addEventListener("click", () => {
    const v = document.querySelector("[data-set-pass]")?.value.trim();
    if (!v) { toast("Enter a passcode first."); return; }
    localStorage.setItem(PASS_KEY, v); document.querySelector("[data-set-pass]").value = "";
    toast("Passcode updated.");
  });
  document.querySelector("[data-audit-reload]")?.addEventListener("click", loadAuditLog);
  document.querySelector("[data-status-refresh]")?.addEventListener("click", loadSystemStatus);
  document.querySelector("[data-version-refresh]")?.addEventListener("click", renderVersionHistory);
  document.querySelector("[data-deploy-refresh]")?.addEventListener("click", loadDeployStatus);
  // Load the system status + activity log the first time Settings is opened.
  const settingsNav = document.querySelector('[data-admin-panel="settings"]');
  let settingsLoaded = false;
  if (settingsNav) settingsNav.addEventListener("click", () => { if (!settingsLoaded) { settingsLoaded = true; loadSystemStatus(); loadAuditLog(); renderVersionHistory(); loadDeployStatus(); } });
  document.querySelector("[data-reset-admin]")?.addEventListener("click", async () => {
    const ok = await ldConfirm({
      title: "Reset admin drafts?",
      body: "This clears all your unsaved local changes in this browser and reloads the live offers, prices and page text. Anything already published stays live. This can't be undone.",
      confirmLabel: "Reset drafts",
      danger: true
    });
    if (!ok) return;
    recordDraftVersion("offers", "Before resetting admin drafts", state.offers);
    recordDraftVersion("prices", "Before resetting admin drafts", state.prices);
    recordDraftVersion("content", "Before resetting admin drafts", state.content);
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
  updateOfferImageStatus();
  renderOffers();
  renderPrices();
  renderTreatmentCards();
  renderContent();
  renderMedia();
  renderReviews();
  updateMetrics();
  updateLastSaved();
}

function updateOfferImageStatus() {
  const status = document.querySelector("[data-image-upload-status]"); if (!status) return;
  const offer = state.offers[selectedOfferIndex];
  const image = offer ? String(offer.image || "") : "";
  status.textContent = image
    ? "Selected photo: " + image.replace(/^.*\//, "") + ". Upload another photo to replace it."
    : "No photo selected yet. Upload a photo before publishing this offer live.";
}

/* ---------------- Media library (R2 uploads + stock assets) ---------------- */
const MEDIA_API = "/admin/api/media";
let mediaCache = []; // [{ key, url, size, uploaded }] from R2

// Resolve an image value to a usable src. Uploaded images are "/media/..." (root
// absolute); stock ones are bare filenames under assets/images/.
function imageSrc(image) {
  const v = String(image || "");
  if (!v) return "";
  if (/^https?:\/\//i.test(v) || v.startsWith("/")) return v;      // full URL or /media/...
  if (v.startsWith("assets/")) return "../" + v;                    // assets/images/x
  return "../assets/images/" + v;                                   // bare filename
}

// offers.json image value: keep full URLs + /media paths as-is; bare filenames go under assets/images/.
function normalizeOfferImage(v) {
  v = String(v || "");
  if (!v) return "";
  if (/^https?:\/\//i.test(v) || v.startsWith("/")) return v;
  if (v.startsWith("assets/")) return v;
  return "assets/images/" + v;
}

function renderMedia() {
  const grid = document.querySelector("[data-media-grid]"); if (!grid) return;
  const uploaded = mediaCache.map((m) => `
    <article class="media-item">
      <img src="${escapeAttr(m.url)}" alt="" loading="lazy" data-dim-on-error>
      <div><strong>${escapeHtml(m.key.replace(/^uploads\//, ""))}</strong><small>Uploaded${m.size ? " · " + Math.round(m.size / 1024) + "KB" : ""}</small></div>
      <button class="tiny-button danger" type="button" data-media-del="${escapeAttr(m.key)}">Delete</button>
    </article>`).join("");
  const stock = imageOptions.map((img) => `
    <article class="media-item"><img src="../assets/images/${escapeAttr(img)}" alt="" loading="lazy" data-dim-on-error><div><strong>${escapeHtml(img)}</strong><small>Stock image</small></div></article>`).join("");
  grid.innerHTML = uploaded + stock;
  grid.querySelectorAll("[data-media-del]").forEach((b) => b.addEventListener("click", () => deleteMedia(b.dataset.mediaDel)));
}

function setMediaStatus(msg, kind) {
  const el = document.querySelector("[data-media-status]");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "admin-status" + (kind ? " is-" + kind : "");
}

async function loadMedia() {
  try {
    const res = await fetch(MEDIA_API, { cache: "no-store", credentials: "same-origin" });
    const data = await ldReadJson(res);
    mediaCache = data.media || [];
    renderMedia();
    updateOfferImageStatus();
  } catch (err) {
    setMediaStatus(ldFriendlyError(err), "error");
  }
}

// Upload a File to R2 via the Worker. Returns the /media URL, or null on failure.
async function uploadMedia(file) {
  if (!file) return null;
  if (!/^image\//.test(file.type || "")) { setMediaStatus("That file is not an image.", "error"); return null; }
  if (file.size > 12 * 1024 * 1024) { setMediaStatus("That image is larger than 12MB — please use a smaller one.", "error"); return null; }
  setMediaStatus("Preparing " + file.name + "…");
  const prepared = await ldPrepareImageUpload(file, { width: 1400, height: 1000, quality: 0.86, prefix: "lumi" });
  setMediaStatus("Uploading " + prepared.name + "…");
  const form = new FormData();
  form.append("file", prepared, prepared.name);
  try {
    const res = await fetch(MEDIA_API + "/upload", { method: "POST", credentials: "same-origin", body: form });
    const data = await ldReadJson(res);
    setMediaStatus("Uploaded.", "ok");
    await loadMedia();
    return data.url || null;
  } catch (err) {
    setMediaStatus("Upload failed: " + ldFriendlyError(err), "error");
    return null;
  }
}

async function ldPrepareImageUpload(file, opts = {}) {
  if (!file || !/^image\//.test(file.type || "")) return file;
  const width = Math.max(320, Number(opts.width || 1400));
  const height = Math.max(240, Number(opts.height || Math.round(width * 0.72)));
  const quality = Math.min(0.95, Math.max(0.6, Number(opts.quality || 0.86)));
  const prefix = String(opts.prefix || "image").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const bitmap = await createImageBitmap(file);
  const sourceRatio = bitmap.width / bitmap.height;
  const targetRatio = width / height;
  let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
  if (sourceRatio > targetRatio) {
    sw = Math.round(bitmap.height * targetRatio);
    sx = Math.round((bitmap.width - sw) / 2);
  } else {
    sh = Math.round(bitmap.width / targetRatio);
    sy = Math.round((bitmap.height - sh) / 2);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#f4f1ee";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  if (bitmap.close) bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob) return file;
  const base = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42) || "upload";
  return new File([blob], prefix + "-" + base + "-" + Date.now().toString(36) + ".webp", { type: "image/webp" });
}
window.ldPrepareImageUpload = ldPrepareImageUpload;

// Where is this uploaded image used? Offers are counted structurally; email
// banners and campaign drafts are found by scanning their saved draft stores.
function findMediaUsage(key) {
  const item = mediaCache.find((m) => m.key === key);
  const url = item ? item.url : "/media/" + key;
  const uses = [];
  const offerCount = state.offers.filter((o) => String(o.image || "") === url).length;
  if (offerCount) uses.push(offerCount + " offer" + (offerCount > 1 ? "s" : ""));
  try {
    const mailDraft = localStorage.getItem("lumi-derm-mail-draft-v1") || "";
    if (mailDraft.indexOf(url) !== -1) uses.push("an email draft");
  } catch { /* ignore */ }
  try {
    const content = JSON.stringify(state.content || {});
    if (content.indexOf(url) !== -1) uses.push("page text");
  } catch { /* ignore */ }
  return uses;
}

async function deleteMedia(key) {
  const uses = findMediaUsage(key);
  const usageLine = uses.length
    ? "This image is currently used by " + uses.join(" and ") + ". Deleting it will leave a blank space there until you pick another image. "
    : "This image doesn't appear to be used anywhere right now. ";
  const ok = await ldConfirm({
    title: uses.length ? "Delete an image that's in use?" : "Delete this image?",
    body: usageLine + "Permanently delete this uploaded image? This can't be undone.",
    confirmLabel: "Delete image",
    danger: true
  });
  if (!ok) return;
  try {
    const res = await fetch(MEDIA_API + "/delete", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key })
    });
    await ldReadJson(res);
    setMediaStatus("Deleted.", "ok");
    await loadMedia();
  } catch (err) {
    setMediaStatus("Delete failed: " + ldFriendlyError(err), "error");
  }
}

function bindMedia() {
  const btn = document.querySelector("[data-media-upload-btn]");
  const input = document.querySelector("[data-media-upload]");
  if (btn && input) btn.addEventListener("click", () => input.click());
  if (input) input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (file) await uploadMedia(file);
    input.value = "";
  });
  // Load the library the first time the Media tab is opened.
  const nav = document.querySelector('[data-admin-panel="media"]');
  let loaded = false;
  if (nav) nav.addEventListener("click", () => { if (!loaded) { loaded = true; loadMedia(); } });
}

function updateMetrics() {
  setText('[data-metric="offers-published"]', state.offers.filter((o) => String(o.status || "").toLowerCase() !== "draft").length);
  setText('[data-metric="reviews-pending"]', state.reviews.filter((r) => r.status === "pending").length);

  const attention = document.querySelector("[data-attention]"); if (!attention) return;
  const items = [];
  if (birthdaysToday) items.push(["Birthday today 🎂", birthdaysToday + " subscriber" + (birthdaysToday === 1 ? "" : "s") + " — send from the Birthdays card"]);
  if (reviewSubmissionsCount) items.push(["New website reviews", reviewSubmissionsCount + " waiting — check the Reviews tab"]);
  const pending = state.reviews.filter((r) => r.status === "pending").length;
  if (pending) items.push(["Reviews to approve", `${pending} pending in the queue`]);
  const drafts = state.offers.filter((o) => String(o.status || "").toLowerCase() === "draft").length;
  if (drafts) items.push(["Offer drafts", `${drafts} not yet published`]);
  // Access is enabled on /admin (verified), so no security to-do here — an
  // evergreen good-practice reminder instead.
  items.push(["Before you send", "Always email yourself a test campaign first"]);
  if (!pending && !drafts) items.push(["Back up your data", "Export a copy from Settings now and then"]);
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

/* ---------- Shared UI helpers (also used by sender.js + subscribers.js via window) ---------- */

// Turn a low-level failure into a friendly, actionable message. The usual cause
// of "Unexpected token <" / "Failed to fetch" here is an expired Cloudflare
// Access session (the request hit a login/redirect page instead of the API).
function ldFriendlyError(err) {
  const m = (err && err.message) || String(err || "");
  if (/Unexpected token|not valid JSON|JSON\.parse|webpage instead|<!doctype|<html|Failed to fetch|NetworkError|Load failed/i.test(m)) {
    return "Couldn't reach the admin service. Your sign-in may have expired — refresh this page to sign in again. If it keeps happening, tell Dima.";
  }
  return m;
}
window.ldFriendlyError = ldFriendlyError;

// Parse a fetch Response as JSON; on HTML/invalid responses throw a friendly error.
async function ldReadJson(res) {
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch (e) { data = null; }
  if (data === null) {
    throw new Error(ldFriendlyError(new Error("webpage instead of data")));
  }
  if (!res.ok) throw new Error(data.error || ("Something went wrong (" + res.status + ")."));
  return data;
}
window.ldReadJson = ldReadJson;

// A styled confirmation modal that returns a Promise<boolean>. Replaces window.confirm
// for high-risk actions. opts: { title, body, confirmLabel, cancelLabel, danger }.
function ldConfirm(opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "ld-modal";
    back.innerHTML =
      '<div class="ld-modal-veil"></div>' +
      '<div class="ld-modal-card" role="dialog" aria-modal="true" aria-labelledby="ld-modal-title">' +
        '<h3 class="ld-modal-title" id="ld-modal-title"></h3>' +
        '<p class="ld-modal-body"></p>' +
        '<div class="ld-modal-actions">' +
          '<button type="button" class="admin-button admin-button-secondary" data-ld-cancel></button>' +
          '<button type="button" class="admin-button" data-ld-confirm></button>' +
        '</div>' +
      '</div>';
    back.querySelector(".ld-modal-title").textContent = opts.title || "Are you sure?";
    back.querySelector(".ld-modal-body").textContent = opts.body || "";
    const cancelBtn = back.querySelector("[data-ld-cancel]");
    const confirmBtn = back.querySelector("[data-ld-confirm]");
    cancelBtn.textContent = opts.cancelLabel || "Cancel";
    confirmBtn.textContent = opts.confirmLabel || "Confirm";
    confirmBtn.classList.add(opts.danger ? "admin-button-danger" : "admin-button-primary");
    const prevOverflow = document.body.style.overflow;
    function close(val) {
      document.removeEventListener("keydown", onKey);
      back.classList.remove("is-open");
      document.body.style.overflow = prevOverflow;
      setTimeout(() => back.remove(), 160);
      resolve(val);
    }
    function onKey(e) { if (e.key === "Escape") close(false); }
    back.querySelector(".ld-modal-veil").addEventListener("click", () => close(false));
    cancelBtn.addEventListener("click", () => close(false));
    confirmBtn.addEventListener("click", () => close(true));
    document.addEventListener("keydown", onKey);
    document.body.appendChild(back);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => { back.classList.add("is-open"); confirmBtn.focus(); });
  });
}
window.ldConfirm = ldConfirm;

/* =====================================================================
   PUBLISHING — offers created here go live on the homepage instantly.
   Offers save to Cloudflare D1 via the Worker (/admin/api/offers/save) — no
   GitHub commit and no deploy; a homepage refresh shows them.
   ===================================================================== */
const PRICES_REPO_PATH = "lumi-derm-website/assets/data/prices.json";    // treatments-page prices data
const SERVICES_REPO_PATH = "lumi-derm-website/pages/services.html";      // treatments page (rendered from prices.json)
const PRICES_MARKERS = /(<!-- PRICES:START[\s\S]*?-->)[\s\S]*?(<!-- PRICES:END -->)/; // section rewritten on publish
const CONTENT_REPO_PATH = "lumi-derm-website/assets/data/content.json";  // hero copy + contact details
const HERO_MARKERS = /(<!-- HERO:START[\s\S]*?-->)[\s\S]*?(<!-- HERO:END -->)/; // homepage hero block
const SEO_MARKERS = /(<!-- SEO:START[\s\S]*?-->)[\s\S]*?(<!-- SEO:END -->)/;    // homepage <head> title + meta description
const ABOUT_HERO_MARKERS = /(<!-- ABOUT_HERO:START[\s\S]*?-->)[\s\S]*?(<!-- ABOUT_HERO:END -->)/;
const ABOUT_STATS_MARKERS = /(<!-- ABOUT_STATS:START[\s\S]*?-->)[\s\S]*?(<!-- ABOUT_STATS:END -->)/;
const ABOUT_BIO_IMAGE_MARKERS = /(<!-- ABOUT_BIO_IMAGE:START[\s\S]*?-->)[\s\S]*?(<!-- ABOUT_BIO_IMAGE:END -->)/;
const ABOUT_BIO_MARKERS = /(<!-- ABOUT_BIO:START[\s\S]*?-->)[\s\S]*?(<!-- ABOUT_BIO:END -->)/;
const ABOUT_CLINIC_MARKERS = /(<!-- ABOUT_CLINIC:START[\s\S]*?-->)[\s\S]*?(<!-- ABOUT_CLINIC:END -->)/;
const ABOUT_CLINIC_IMAGE_MARKERS = /(<!-- ABOUT_CLINIC_IMAGE:START[\s\S]*?-->)[\s\S]*?(<!-- ABOUT_CLINIC_IMAGE:END -->)/;
const ABOUT_CONCERNS_MARKERS = /(<!-- ABOUT_CONCERNS:START[\s\S]*?-->)[\s\S]*?(<!-- ABOUT_CONCERNS:END -->)/;
const ABOUT_CONCERN_CARDS_MARKERS = /(<!-- ABOUT_CONCERN_CARDS:START[\s\S]*?-->)[\s\S]*?(<!-- ABOUT_CONCERN_CARDS:END -->)/;
const ABOUT_TREATMENTS_MARKERS = /(<!-- ABOUT_TREATMENTS:START[\s\S]*?-->)[\s\S]*?(<!-- ABOUT_TREATMENTS:END -->)/;
const ABOUT_BENEFITS_MARKERS = /(<!-- ABOUT_BENEFITS:START[\s\S]*?-->)[\s\S]*?(<!-- ABOUT_BENEFITS:END -->)/;
const ABOUT_BENEFIT_CARDS_MARKERS = /(<!-- ABOUT_BENEFIT_CARDS:START[\s\S]*?-->)[\s\S]*?(<!-- ABOUT_BENEFIT_CARDS:END -->)/;
const ABOUT_JOURNEY_MARKERS = /(<!-- ABOUT_JOURNEY:START[\s\S]*?-->)[\s\S]*?(<!-- ABOUT_JOURNEY:END -->)/;
const ABOUT_JOURNEY_STEPS_MARKERS = /(<!-- ABOUT_JOURNEY_STEPS:START[\s\S]*?-->)[\s\S]*?(<!-- ABOUT_JOURNEY_STEPS:END -->)/;
const ABOUT_CTA_MARKERS = /(<!-- ABOUT_CTA:START[\s\S]*?-->)[\s\S]*?(<!-- ABOUT_CTA:END -->)/;
const SERVICES_HERO_MARKERS = /(<!-- SERVICES_HERO:START[\s\S]*?-->)[\s\S]*?(<!-- SERVICES_HERO:END -->)/;
const BOOKING_HERO_MARKERS = /(<!-- BOOKING_HERO:START[\s\S]*?-->)[\s\S]*?(<!-- BOOKING_HERO:END -->)/;
const BOOKING_PICKER_MARKERS = /(<!-- BOOKING_PICKER:START[\s\S]*?-->)[\s\S]*?(<!-- BOOKING_PICKER:END -->)/;
const BOOKING_WIDGET_MARKERS = /(<!-- BOOKING_WIDGET:START[\s\S]*?-->)[\s\S]*?(<!-- BOOKING_WIDGET:END -->)/;
const BOOKING_SUPPORT_MARKERS = /(<!-- BOOKING_SUPPORT:START[\s\S]*?-->)[\s\S]*?(<!-- BOOKING_SUPPORT:END -->)/;
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
/* Publishing goes through the Worker proxy (/admin/api/github), which injects
   the GitHub token from a Cloudflare secret. Nothing sensitive is stored in the
   browser any more — the repo/branch/token all live server-side. */
const GH_PROXY = "/admin/api/github";
const GH_PUBLISH = "/admin/api/publish";
const GH_HEALTH = "/admin/api/github/health";
let ghReady = true; // optimistic; refined by the server health check below

// Atomic publish: send every changed file to the Worker, which commits them in
// ONE commit and keeps the CSP JSON-LD hash in sync. files: [{path, content}].
async function ghPublishFiles(files, message) {
  const res = await fetch(GH_PUBLISH, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, files }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || ("Publish failed (" + res.status + ")."));
  return payload;
}

// Read a file's current text from the repo through the read-only proxy.
async function ghReadRepoFile(repoPath) {
  const res = await ghRequest(repoPath + "?ref=main&_=" + Date.now(), { method: "GET" });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(ghError(res.status, e.message)); }
  return decodeB64((await res.json()).content);
}

// Save prices / page text straight to Cloudflare D1 (instant, edge-rendered).
// payload: { content?, prices?, regions?: [...], pages: { repoPath: fullHtml } }
async function ghPublishContent(payload) {
  const res = await fetch("/admin/api/content/save", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ("Save failed (" + res.status + ")."));
  return data;
}

// probe === true does a live GitHub call (button); otherwise it's the cheap
// page-load check that only reports whether the server secret is set.
async function checkGithubHealth(probe) {
  const live = probe === true;
  setGhStatus(live ? "Checking the connection live…" : "Checking…");
  try {
    const res = await fetch(GH_HEALTH + (live ? "?probe=1" : ""), { cache: "no-store", credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { ghReady = false; setGhStatus(data.error || ("Could not check publishing (" + res.status + ").")); return; }

    ghReady = data.configured === true;
    if (!ghReady) {
      setGhStatus("Not set up yet: Dima needs to add the GitHub token as a Cloudflare secret (see the guide).");
      return;
    }
    const where = (data.repo || "repo") + " · " + (data.branch || "main");

    if (!data.probed) {
      setGhStatus("Set up on the server (" + where + "). Click “Check connection” to test it live.");
      return;
    }
    if (!data.reachable) {
      const s = data.status;
      let m;
      if (s === 401 || s === 403) m = "GitHub rejected the token (" + s + "). It may be wrong, expired, or lack access — Dima: update the GITHUB_TOKEN secret.";
      else if (s === 404) m = "Repo not found or not visible to the token. Check GITHUB_REPO (" + (data.repo || "?") + ").";
      else m = "GitHub error" + (s ? " (" + s + ")" : "") + (data.error ? ": " + data.error : ".");
      ghReady = false;
      setGhStatus("✗ " + m);
      return;
    }
    if (data.canWrite === false) {
      setGhStatus("Connected, but the token is read-only — publishing will fail. Dima: set Contents to “Read and write” and update the secret.");
    } else if (data.canWrite === true) {
      setGhStatus("✓ Connected and working — the token can read and write " + where + ".");
    } else {
      setGhStatus("✓ Connected — reached " + where + " successfully. Write access is confirmed on your first publish.");
    }
  } catch (err) {
    ghReady = false;
    setGhStatus(ldFriendlyError(err));
  }
}

/* admin shape -> offers.json shape (exactly what the homepage expects) */
function toOffersJson(offers) {
  return offers.map((o) => ({
    title: o.title || "",
    category: o.category || "",
    description: o.description || "",
    price: o.price || "",
    badge: o.badge || "",
    image: normalizeOfferImage(o.image),
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
    id: o.id || null,
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

/* Pull the offers that are actually on the website right now (live from D1) */
async function loadOffersFromSite(announce) {
  try {
    const res = await fetch("/admin/api/offers", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) throw new Error("not found");
    const data = await res.json();
    const list = Array.isArray(data.offers) ? data.offers : [];
    state.offers = fromOffersJson(list);
    selectedOfferIndex = 0;
    renderOffers();
    saveDraft(announce ? "Loaded the offers currently on the website." : null);
    setPublishStatus("In sync with the website.");
  } catch (err) {
    if (announce) toast("Could not read the current offers.");
  }
}


/* GitHub errors -> plain English the user can act on */
function ghError(status, message) {
  if (status === 403 || /not accessible by personal access token/i.test(message || "")) {
    return "The server\u2019s GitHub token can read the repo but can\u2019t write to it. Dima: set the token\u2019s Contents permission to \u201cRead and write\u201d, then update the GITHUB_TOKEN secret.";
  }
  if (status === 401) return "The server\u2019s GitHub token was rejected \u2014 it may be expired. Dima: rotate the GITHUB_TOKEN secret.";
  if (status === 404) return "Could not find that file in the repo. If this keeps happening, tell Dima.";
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

/* Calls the Worker proxy instead of api.github.com directly. The Worker holds
   the token (Cloudflare secret) and owns the repo/branch. We keep the same
   call shape (path + {method, body}) so every publish routine works unchanged;
   the Worker forwards GitHub's status + JSON body verbatim. */
async function ghRequest(path, options) {
  options = options || {};
  const method = options.method || "GET";
  const cleanPath = String(path).split("?")[0]; // drop ?ref/&_= — the Worker owns branch
  const payload = { method, path: cleanPath };
  if (options.body) {
    try {
      const b = JSON.parse(options.body);
      if (b.message != null) payload.message = b.message;
      if (b.content != null) payload.content = b.content;
      if (b.sha != null) payload.sha = b.sha;
    } catch { /* non-JSON body — nothing to forward */ }
  }
  return fetch(GH_PROXY, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

/* THE BUTTON: create offers -> click Publish -> live on the homepage instantly.
   Offers now save straight to Cloudflare D1 via the Worker — no GitHub commit,
   no deploy. A refresh of the homepage shows them. */
async function publishOffers(options) {
  // NOTE: called both as a click handler (options = Event) and internally ({ silent: true })
  const silent = !!(options && options.silent === true);
  const button = document.querySelector("[data-publish-offers]");
  if (button) { button.disabled = true; button.textContent = "Publishing…"; }
  setPublishStatus("Saving to the website…");

  try {
    if (syncCurrentOfferEditorToState()) renderOffers();
    const validation = validateOffersForPublish(state.offers);
    if (!validation.ok) throw new Error(validation.message);
    recordDraftVersion("offers", "Before publishing offers", state.offers);

    const res = await fetch("/admin/api/offers/save", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offers: toOffersJson(state.offers) }),
    });
    const data = await ldReadJson(res);
    if (!res.ok) throw new Error(data.error || "Could not save offers.");

    state.publishedAt = new Date().toISOString();
    saveDraft(null);
    setPublishStatus("Saved — offers are live now. Refresh the homepage to see them.");
    if (!silent) toast("Saved — offers are live now.");
    return true;
  } catch (err) {
    setPublishStatus("Save failed: " + ldFriendlyError(err));
    if (!silent) toast("Save failed: " + ldFriendlyError(err));
    return false;
  } finally {
    if (button) { button.disabled = false; button.textContent = "Publish offers"; }
  }
}

function validateOffersForPublish(offers) {
  const incomplete = (offers || []).find((o) => offerVisibleOnSite(o) && incompleteLiveOfferReason(o));
  if (incomplete) {
    return { ok: false, message: "Finish the live offer \"" + (incomplete.title || "New offer") + "\" before publishing: " + incompleteLiveOfferReason(incomplete) + "." };
  }
  const duplicate = findDuplicateVisibleOffer(offers || []);
  if (duplicate) {
    return { ok: false, message: "Remove one duplicate before publishing: \"" + (duplicate.title || "Untitled offer") + "\" appears twice." };
  }
  return { ok: true };
}

function incompleteLiveOfferReason(offer) {
  const title = String(offer.title || "").trim();
  const price = String(offer.price || "").trim();
  const description = String(offer.description || "").trim();
  if (!title || title.toLowerCase() === "new offer") return "replace the placeholder title";
  if (!price || price.toLowerCase() === "from £") return "add the display price";
  if (!description || description === "Short offer description.") return "add the short description";
  if (!String(offer.image || "").trim()) return "upload a photo";
  return "";
}

function offerVisibleOnSite(offer) {
  if (!offer || String(offer.status || "live").toLowerCase() === "draft") return false;
  if (!offer.expires) return true;
  const end = new Date(String(offer.expires) + "T23:59:59");
  if (isNaN(end.getTime())) return true;
  return end.getTime() >= Date.now();
}

function duplicateOfferKey(offer) {
  return [
    offer.title,
    offer.category,
    offer.price,
    offer.service,
    offer.expires,
  ].map((v) => String(v || "").trim().toLowerCase()).join("|");
}

function findDuplicateVisibleOffer(offers) {
  const seen = new Map();
  for (const offer of offers) {
    if (!offerVisibleOnSite(offer)) continue;
    const key = duplicateOfferKey(offer);
    if (seen.has(key)) return offer;
    seen.set(key, offer);
  }
  return null;
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

async function publishTreatmentMenu(opts) {
  if (typeof window.renderTreatmentLibrary !== "function") { toast("Treatment template didn’t load — hard-refresh the admin and try again."); return false; }
  if (!state.prices || !(state.prices.groups || []).length) { toast("No treatments loaded yet — click “Reload from website” first."); return false; }
  normaliseSelectedTx();
  const cfg = Object.assign({
    buttonSelector: "[data-publish-prices]",
    idleLabel: "Publish prices",
    confirmTitle: "Publish prices?",
    confirmLabel: "Publish prices",
    snapshotLabel: "Before publishing prices",
    successToast: "Prices are live now.",
    status: setPricesStatus
  }, opts || {});

  if (!(await ldConfirm({
    title: cfg.confirmTitle,
    body: "This updates the live Treatments & prices page for everyone visiting the website, straight away. Continue?",
    confirmLabel: cfg.confirmLabel
  }))) return false;

  const button = document.querySelector(cfg.buttonSelector);
  if (button) { button.disabled = true; button.textContent = "Publishing…"; }
  cfg.status("Saving to the treatments page…");
  recordDraftVersion("prices", cfg.snapshotLabel, state.prices);
  try {
    // Render the treatments section and drop it into the page template's PRICES
    // markers; the Worker stores just that region and injects it live (edge-render).
    const rendered = window.renderTreatmentLibrary(state.prices);
    const before = await ghReadRepoFile(SERVICES_REPO_PATH);
    if (!PRICES_MARKERS.test(before)) throw new Error("The price markers weren’t found in services.html — ask Dima to check the page.");
    const pageHtml = before.replace(PRICES_MARKERS, (m, s, e) => s + "\n\n" + rendered + "\n\n          " + e);

    await ghPublishContent({ prices: state.prices, regions: ["PRICES"], pages: { [SERVICES_REPO_PATH]: pageHtml } });

    state.publishedAt = new Date().toISOString();
    saveDraft(null);
    cfg.status("Saved — the treatments page is live now. Refresh it to see the changes.");
    toast(cfg.successToast);
    return true;
  } catch (err) {
    cfg.status("Save failed: " + ldFriendlyError(err));
    toast("Save failed: " + ldFriendlyError(err));
    return false;
  } finally {
    if (button) { button.disabled = false; button.textContent = cfg.idleLabel; }
  }
}

async function publishPrices() {
  return publishTreatmentMenu();
}

async function publishTreatmentCards() {
  return publishTreatmentMenu({
    buttonSelector: "[data-publish-treatments]",
    idleLabel: "Publish treatment cards",
    confirmTitle: "Publish treatment cards?",
    confirmLabel: "Publish treatment cards",
    snapshotLabel: "Before publishing treatment cards",
    successToast: "Treatment cards are live now.",
    status: setTreatmentStatus
  });
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
// After a successful publish, re-baseline the editor to the just-published values
// so every field returns to a clean "in sync with the website" state — no leftover
// draft, no half-typed text lingering after the commit.
function resetContentBaseline(content) {
  state.content = mergeContent(content || state.content || {});
  state.publishedAt = new Date().toISOString();
  saveDraft(null);
  renderContent(); // re-populates page-text + FAQ fields from the clean baseline
}

/* ---------- Publish page text: one button per section ----------
   Each section (SEO, homepage hero, contact, About, treatments intro, booking
   intro) publishes on its own. We always start from the LIVE content.json, swap
   in just this section's edits, rewrite only that section's page region(s), and
   commit once — so publishing one section never disturbs another section's
   unpublished edits. Contact details still fan out across every page. */
const HOME_REPO_PATH = "lumi-derm-website/index.html";
const ABOUT_REPO_PATH = "lumi-derm-website/pages/about.html";
const BOOKING_REPO_PATH = "lumi-derm-website/pages/booking.html";

const CONTENT_SECTIONS = {
  seo: {
    label: "SEO",
    pick: (c) => (c && c.seo) || {},
    apply: (dst, src) => { dst.seo = structuredClone((src && src.seo) || {}); },
    build: async (files, merged) => {
      if (typeof window.renderSeo !== "function") return;
      const before = await ghReadRepoFile(HOME_REPO_PATH);
      if (!SEO_MARKERS.test(before)) return;
      const out = before.replace(SEO_MARKERS, "$1\n    " + window.renderSeo(merged.seo || {}) + "\n    $2");
      if (out !== before) files.push({ path: HOME_REPO_PATH, content: out });
    }
  },
  hero: {
    label: "Homepage hero",
    pick: (c) => (c && c.hero) || {},
    apply: (dst, src) => { dst.hero = structuredClone((src && src.hero) || {}); },
    build: async (files, merged) => {
      const before = await ghReadRepoFile(HOME_REPO_PATH);
      if (!HERO_MARKERS.test(before)) return;
      const out = before.replace(HERO_MARKERS, "$1\n              " + window.renderHero(merged.hero || {}) + "\n              $2");
      if (out !== before) files.push({ path: HOME_REPO_PATH, content: out });
    }
  },
  contact: {
    label: "Contact details",
    pick: (c) => (c && c.contact) || {},
    apply: (dst, src) => { dst.contact = structuredClone((src && src.contact) || {}); },
    build: async (files, merged, oldContent) => {
      const ops = contactOps(oldContent.contact || {}, merged.contact || {});
      if (!ops.length) return;
      for (const repoPath of SITE_PAGE_PATHS) {
        const before = await ghReadRepoFile(repoPath);
        const out = applyOps(before, ops);
        if (out !== before) files.push({ path: repoPath, content: out });
      }
    }
  },
  about: {
    label: "About page",
    pick: (c) => (c && c.pages && c.pages.about) || {},
    apply: (dst, src) => { dst.pages = dst.pages || {}; dst.pages.about = structuredClone((src && src.pages && src.pages.about) || {}); },
    build: async (files, merged) => {
      const about = (merged.pages && merged.pages.about) || {};
      const before = await ghReadRepoFile(ABOUT_REPO_PATH);
      let out = before;
      [
        [ABOUT_HERO_MARKERS, () => window.renderSimpleHero(about.hero)],
        [ABOUT_STATS_MARKERS, () => window.renderAboutStats(about.stats)],
        [ABOUT_BIO_IMAGE_MARKERS, () => window.renderAboutImage(about.bio && about.bio.image)],
        [ABOUT_BIO_MARKERS, () => window.renderAboutBio(about.bio)],
        [ABOUT_CLINIC_MARKERS, () => window.renderAboutClinic(about.clinic)],
        [ABOUT_CLINIC_IMAGE_MARKERS, () => window.renderAboutImage(about.clinic && about.clinic.image)],
        [ABOUT_CONCERNS_MARKERS, () => window.renderSectionHeader(about.concerns)],
        [ABOUT_CONCERN_CARDS_MARKERS, () => window.renderAboutConcernCards(about.concerns)],
        [ABOUT_TREATMENTS_MARKERS, () => window.renderSectionHeader(about.treatments)],
        [ABOUT_BENEFITS_MARKERS, () => window.renderSectionHeader(about.benefits)],
        [ABOUT_BENEFIT_CARDS_MARKERS, () => window.renderAboutBenefitCards(about.benefits)],
        [ABOUT_JOURNEY_MARKERS, () => window.renderSectionHeader(about.journey)],
        [ABOUT_JOURNEY_STEPS_MARKERS, () => window.renderAboutJourneySteps(about.journey)],
        [ABOUT_CTA_MARKERS, () => window.renderAboutCta(about.cta)]
      ].forEach(([markers, render]) => { if (markers.test(out)) out = out.replace(markers, "$1\n            " + render() + "\n            $2"); });
      if (out !== before) files.push({ path: ABOUT_REPO_PATH, content: out });
    }
  },
  services: {
    label: "Treatments intro",
    pick: (c) => (c && c.pages && c.pages.services) || {},
    apply: (dst, src) => { dst.pages = dst.pages || {}; dst.pages.services = structuredClone((src && src.pages && src.pages.services) || {}); },
    build: async (files, merged) => {
      const before = await ghReadRepoFile(SERVICES_REPO_PATH);
      if (!SERVICES_HERO_MARKERS.test(before)) return;
      const hero = (merged.pages && merged.pages.services && merged.pages.services.hero) || {};
      const out = before.replace(SERVICES_HERO_MARKERS, "$1\n            " + window.renderSimpleHero({ ...hero, leadClass: "treatment-intro" }) + "\n            $2");
      if (out !== before) files.push({ path: SERVICES_REPO_PATH, content: out });
    }
  },
  booking: {
    label: "Booking intro",
    pick: (c) => (c && c.pages && c.pages.booking) || {},
    apply: (dst, src) => { dst.pages = dst.pages || {}; dst.pages.booking = structuredClone((src && src.pages && src.pages.booking) || {}); },
    build: async (files, merged) => {
      const b = (merged.pages && merged.pages.booking) || {};
      const before = await ghReadRepoFile(BOOKING_REPO_PATH);
      let out = before;
      [
        [BOOKING_HERO_MARKERS, () => window.renderBookingHero(b.hero)],
        [BOOKING_PICKER_MARKERS, () => window.renderBookingPicker(b.picker)],
        [BOOKING_WIDGET_MARKERS, () => window.renderBookingWidget(b.widget)],
        [BOOKING_SUPPORT_MARKERS, () => window.renderBookingSupport(b.support)]
      ].forEach(([markers, render]) => { if (markers.test(out)) out = out.replace(markers, "$1\n            " + render() + "\n            $2"); });
      if (out !== before) files.push({ path: BOOKING_REPO_PATH, content: out });
    }
  }
};

function setSectionStatus(sectionId, message) {
  const el = document.querySelector('[data-section-status="' + sectionId + '"]');
  if (el) el.textContent = message || "";
}

// Which regions each About publish stores in D1 (must mirror the Worker's
// PAGE_REGIONS.about). Regions whose markers aren't present are simply skipped.
const ABOUT_REGIONS = [
  "ABOUT_HERO", "ABOUT_STATS", "ABOUT_BIO_IMAGE", "ABOUT_BIO",
  "ABOUT_CLINIC", "ABOUT_CLINIC_IMAGE", "ABOUT_CONCERNS", "ABOUT_CONCERN_CARDS",
  "ABOUT_TREATMENTS", "ABOUT_BENEFITS", "ABOUT_BENEFIT_CARDS",
  "ABOUT_JOURNEY", "ABOUT_JOURNEY_STEPS", "ABOUT_CTA",
];

// Transport per Pages section. "d1" = instant edge-render (fragments + content
// saved to D1, injected live by the Worker). "github" = contact details, which
// fan out across every page's footer (not a marker region) and need a commit.
const SECTION_TRANSPORT = {
  seo: { transport: "d1", regions: ["SEO"] },
  hero: { transport: "d1", regions: ["HERO"] },
  about: { transport: "d1", regions: ABOUT_REGIONS },
  services: { transport: "d1", regions: ["SERVICES_HERO"] },
  booking: { transport: "d1", regions: ["BOOKING_HERO", "BOOKING_PICKER", "BOOKING_WIDGET", "BOOKING_SUPPORT"] },
  contact: { transport: "github" },
};

async function publishContentSection(sectionId) {
  const cfg = CONTENT_SECTIONS[sectionId];
  if (!cfg) return false;
  if (!ghReady) { toast("Publishing isn't set up on the server yet — ask Dima."); return false; }
  if (typeof window.renderHero !== "function") { toast("Page template didn’t load — hard-refresh the admin and try again."); return false; }
  if (!contentReady()) { toast("No page text loaded yet — click “Reload from website” first."); return false; }

  const button = document.querySelector('[data-publish-section="' + sectionId + '"]');
  const idleLabel = button ? button.textContent : "Publish";
  if (button) { button.disabled = true; button.textContent = "Publishing…"; }
  setSectionStatus(sectionId, "Publishing…");
  recordDraftVersion("content", "Before publishing " + cfg.label, state.content);
  try {
    const t = SECTION_TRANSPORT[sectionId] || { transport: "github" };
    // 1) authoritative CURRENT content = D1 (what the editor reloads from), file
    //    fallback. Merging onto this preserves other sections' published edits.
    let oldContent = structuredClone(DEFAULT_CONTENT);
    try {
      const r = await fetch("/admin/api/content", { cache: "no-store", credentials: "same-origin" });
      if (r.ok) { const d = await r.json(); if (d && d.content) oldContent = mergeContent(d.content); }
    } catch { /* keep default */ }
    state.content = mergeContent(state.content);

    // 2) nothing changed in this section?
    if (JSON.stringify(cfg.pick(oldContent)) === JSON.stringify(cfg.pick(state.content))) {
      setSectionStatus(sectionId, "Nothing to publish — no changes in this section.");
      toast("No changes to publish in " + cfg.label + ".");
      return true;
    }

    // 3) merged = current content with ONLY this section swapped in
    const merged = structuredClone(oldContent);
    cfg.apply(merged, state.content);

    if (t.transport === "d1") {
      // Instant: store the rendered region fragments + the full content in D1;
      // the Worker edge-renders them into the live page straight away.
      const pageFiles = [];
      await cfg.build(pageFiles, merged, oldContent);
      const pages = {};
      pageFiles.forEach((f) => { pages[f.path] = f.content; });
      await ghPublishContent({ content: merged, regions: t.regions, pages });
      setSectionStatus(sectionId, "Published — live now. Refresh the page to see it.");
      setContentStatus("Last published: " + cfg.label + " (live now).");
      toast(cfg.label + " published — live now.");
    } else {
      // Contact details fan out across every page's footer (not a marker region),
      // so they go through a GitHub commit. We also mirror the content into D1 so
      // the editor keeps reloading a consistent picture.
      const files = [{ path: CONTENT_REPO_PATH, content: JSON.stringify(merged, null, 2) + "\n" }];
      await cfg.build(files, merged, oldContent);
      await ghPublishFiles(files, "Update " + cfg.label + " (via admin)");
      try { await ghPublishContent({ content: merged }); } catch { /* editor mirror is best-effort */ }
      const changed = files.length - 1;
      setSectionStatus(sectionId, "Published — deploying now (~1 min). You'll get a note when it's live.");
      setContentStatus("Last published: " + cfg.label + " (" + changed + " page" + (changed === 1 ? "" : "s") + ").");
      startDeployWatch();
      toast(cfg.label + " published — deploying now.");
    }
    return true;
  } catch (err) {
    setSectionStatus(sectionId, "Publish failed: " + ldFriendlyError(err));
    toast("Publish failed: " + ldFriendlyError(err));
    return false;
  } finally {
    if (button) { button.disabled = false; button.textContent = idleLabel; }
  }
}

/* ---------- Delete one offer straight from D1 (instant) ---------- */
async function deleteOffer(index) {
  const offer = state.offers[index];
  if (!offer) return;
  const label = offer.title || "this offer";
  const ok = await ldConfirm({
    title: "Delete this offer?",
    body: "\u201c" + label + "\u201d will be removed from the website straight away.",
    confirmLabel: "Delete offer",
  });
  if (!ok) return;

  const id = offer.id;
  state.offers.splice(index, 1);
  selectedOfferIndex = Math.max(0, Math.min(selectedOfferIndex, state.offers.length - 1));
  renderOffers();
  saveDraft(null);

  if (!id) { toast("Offer removed."); return; } // was never saved to the site
  setPublishStatus("Removing \u201c" + label + "\u201d\u2026");
  try {
    const res = await fetch("/admin/api/offers/delete", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await ldReadJson(res);
    if (!res.ok) throw new Error(data.error || "Could not delete the offer.");
    setPublishStatus("Deleted \u2014 removed from the site.");
    toast("\u201c" + label + "\u201d deleted.");
  } catch (err) {
    setPublishStatus("Delete failed: " + ldFriendlyError(err));
    toast("Delete failed: " + ldFriendlyError(err) + " Use Reload from website to resync.");
  }
}

function bindPublishing() {
  document.querySelector("[data-publish-offers]")?.addEventListener("click", publishOffers);
  document.querySelector("[data-publish-reviews]")?.addEventListener("click", publishReviews);
  document.querySelector("[data-publish-prices]")?.addEventListener("click", publishPrices);
  document.querySelector("[data-publish-treatments]")?.addEventListener("click", publishTreatmentCards);
  document.querySelectorAll("[data-publish-section]").forEach((b) => b.addEventListener("click", () => publishContentSection(b.dataset.publishSection)));
  document.querySelector("[data-reload-offers]")?.addEventListener("click", async () => {
    const ok = await ldConfirm({
      title: "Reload live offers?",
      body: "This replaces the local offers in this browser with the offers currently on the website. You can use Undo local edit straight after if needed.",
      confirmLabel: "Reload live offers"
    });
    if (!ok) return;
    recordDraftVersion("offers", "Before reloading live offers", state.offers);
    loadOffersFromSite(true);
  });

  // Publishing is handled server-side (the token is a Cloudflare secret). We only
  // check the server is configured — there's nothing to enter in the browser.
  checkGithubHealth();

  document.querySelector("[data-gh-test]")?.addEventListener("click", () => checkGithubHealth(true));
}

function setGhStatus(message) {
  const el = document.querySelector("[data-gh-status]");
  if (el) el.textContent = message;
}

/* ---------- Activity log (server-side audit trail) ---------- */
const AUDIT_API = "/admin/api/audit";
const AUDIT_LABELS = {
  "campaign.send": "Sent campaign", "campaign.test": "Sent test email",
  "campaign.schedule": "Scheduled campaign", "campaign.cancel": "Cancelled scheduled send",
  "publish.offers": "Published offers", "publish.reviews": "Published reviews",
  "publish.prices": "Published prices", "publish.treatments": "Published treatment cards", "publish.pages": "Published page text",
  "upload.image": "Uploaded image", "delete.image": "Deleted image",
  "subscriber.delete": "Deleted subscriber", "subscriber.export": "Exported subscribers (CSV)",
  "subscriber.import": "Imported subscribers (CSV)",
  "subscriber.optin": "New subscriber confirmed", "birthday.config": "Changed birthday automation",
  "birthday.test": "Sent birthday preview", "auth.denied": "Sign-in denied"
};

function auditLabel(action) { return AUDIT_LABELS[action] || action || "—"; }

function auditWhen(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || "";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/* ---------- Birthday reminders (dashboard) ---------- */
const BIRTHDAY_API = "/admin/api/birthdays";
const MONTHS_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
let birthdaysToday = 0;
let birthdayToastShown = false;

function birthdayWhen(days) { return days === 0 ? "Today" : days === 1 ? "Tomorrow" : "in " + days + " days"; }

async function loadBirthdays() {
  const box = document.querySelector("[data-birthday-list]");
  if (!box) return;
  try {
    const res = await fetch(BIRTHDAY_API, { cache: "no-store", credentials: "same-origin" });
    const data = await ldReadJson(res);
    const list = data.birthdays || [];
    renderBirthdays(list);
    birthdaysToday = data.today || 0;
    updateMetrics();
    if (birthdaysToday > 0 && !birthdayToastShown) {
      birthdayToastShown = true;
      const names = list.filter((b) => b.daysUntil === 0).map((b) => b.name || b.email.split("@")[0]);
      toast("🎂 Birthday today: " + names.join(", "));
    }
  } catch (err) {
    box.innerHTML = '<p class="admin-status is-error">' + escapeHtml(ldFriendlyError(err)) + "</p>";
  }
}

function renderBirthdays(list) {
  const box = document.querySelector("[data-birthday-list]");
  if (!box) return;
  if (!list.length) { box.innerHTML = '<p class="admin-help">No birthdays in the next 7 days.</p>'; return; }
  box.innerHTML = list.map((b) => {
    const date = b.birth_day + " " + (MONTHS_SHORT[b.birth_month] || "");
    const when = birthdayWhen(b.daysUntil);
    let action;
    if (b.alreadySent) action = '<span class="birthday-sent">Sent ✓</span>';
    else if (b.daysUntil === 0) action = '<button class="tiny-button primary" type="button" data-birthday-send="' + escapeAttr(b.email) + '">Send birthday email</button>';
    else action = '<span class="birthday-note">' + escapeHtml(when) + "</span>";
    return '<div class="birthday-item' + (b.daysUntil === 0 ? " is-today" : "") + '">' +
      "<div><strong>" + escapeHtml(b.name || b.email) + "</strong><span>" + escapeHtml(date + " · " + when) + "</span></div>" +
      action + "</div>";
  }).join("");
  box.querySelectorAll("[data-birthday-send]").forEach((btn) => btn.addEventListener("click", () => sendBirthdayTo(btn.dataset.birthdaySend, btn)));
}

async function sendBirthdayTo(email, btn) {
  const ok = await ldConfirm({
    title: "Send birthday email?",
    body: "Send the birthday email to " + email + " now? (This also stops the automation from sending them a duplicate today.)",
    confirmLabel: "Send birthday email"
  });
  if (!ok) return;
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(BIRTHDAY_API + "/send", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email })
    });
    await ldReadJson(res);
    toast("Birthday email sent to " + email + ".");
    loadBirthdays();
  } catch (err) {
    toast(ldFriendlyError(err));
    if (btn) btn.disabled = false;
  }
}

// Learn the signed-in admin's role right after unlock and lock the whole UI down
// accordingly, so an assistant never sees controls that would fail server-side.
// Runs on every tab, not just Settings.
async function loadRole() {
  try {
    const res = await fetch("/admin/api/health", { cache: "no-store", credentials: "same-origin" });
    const d = await ldReadJson(res);
    adminRole = d.role || "owner";
  } catch {
    // Keep the default on a transient failure — the server still enforces every
    // owner-only action regardless of what the UI shows.
  }
  roleLoaded = true;
  applyRoleControls();
  // Re-hide owner-only review submissions now that the role is known.
  if (adminRole === "assistant") {
    const card = document.querySelector("[data-review-submissions-card]");
    if (card) card.hidden = true;
  }
}

async function loadSystemStatus() {
  const box = document.querySelector("[data-system-status]");
  if (!box) return;
  box.innerHTML = '<li><span>Checking…</span></li>';
  const dot = (ok) => (ok === null ? "" : '<em class="status-dot ' + (ok ? "is-ok" : "is-bad") + '" aria-hidden="true"></em>');
  try {
    const res = await fetch("/admin/api/health", { cache: "no-store", credentials: "same-origin" });
    const d = await ldReadJson(res);
    adminRole = d.role || "owner";
    applyRoleControls();
    renderRolePanel(d);
    const dep = d.deploy;
    const ls = d.lastSend;
    const rows = [
      ["Signed in as", escapeHtml(d.adminEmail || "—"), true],
      ["Database (D1)", d.subscribers ? "Connected" : "Not connected", !!d.subscribers],
      ["Email (Resend)", d.resend ? "Connected" : "Not connected", !!d.resend],
      ["Unsubscribe suppression", d.suppression ? "Connected" : "Not connected", !!d.suppression],
      ["Publishing (GitHub)", d.github ? "Connected" : "Not set up", !!d.github],
      ["Image storage (R2)", d.media ? "Connected" : "Not set up", !!d.media],
      ["Sending from", escapeHtml(d.from || "—"), !!d.from],
      ["Last deploy", dep && (dep.tag || dep.id) ? escapeHtml((dep.tag || dep.id) + (dep.timestamp ? " · " + auditWhen(dep.timestamp) : "")) : "unknown", dep ? true : null],
      ["Last successful send", ls ? escapeHtml('“' + ls.subject + '” — ' + ls.sent + " sent · " + auditWhen(ls.at)) : "none yet", ls ? true : null],
    ];
    box.innerHTML = rows.map((r) => "<li>" + dot(r[2]) + "<span>" + r[0] + "</span><strong>" + r[1] + "</strong></li>").join("");
    renderOnboardingChecklist(d);
  } catch (err) {
    box.innerHTML = '<li><span>Could not load status</span><strong>' + escapeHtml(ldFriendlyError(err)) + "</strong></li>";
    renderOnboardingChecklist(null);
  }
}

function renderRolePanel(d) {
  const box = document.querySelector("[data-role-panel]");
  if (!box) return;
  const role = d && d.role ? d.role : "owner";
  const isOwner = role === "owner";
  // [label, ownerCan, assistantCan]
  const caps = [
    ["Edit drafts (offers, prices, page text)", true, true],
    ["View analytics, history and status", true, true],
    ["Publish changes to the website", true, false],
    ["Send or schedule campaigns", true, false],
    ["Approve, publish or moderate reviews", true, false],
    ["View, import, export or delete subscribers", true, false],
    ["Upload or delete media", true, false],
    ["Record booking / revenue attribution", true, false],
  ];
  const yn = (v) => v
    ? '<span class="cap-yes">✓ Yes</span>'
    : '<span class="cap-no">✗ No</span>';
  const rows = caps.map((c) => {
    const allowed = isOwner ? c[1] : c[2];
    return '<li class="' + (allowed ? "cap-on" : "cap-off") + '"><span>' + escapeHtml(c[0]) + "</span>" + yn(allowed) + "</li>";
  }).join("");
  box.innerHTML =
    '<p class="role-who">Signed in as <strong>' + escapeHtml(d && d.adminEmail || "—") + "</strong>" +
    ' · <span class="role-badge role-' + escapeAttr(role) + '">' + escapeHtml(isOwner ? "Owner" : "Assistant") + "</span></p>" +
    '<p class="admin-help">' + (isOwner
      ? "You have full access to everything below."
      : "You can edit drafts. Publishing, sending, deleting and exports are owner-only.") + "</p>" +
    '<ul class="role-caps">' + rows + "</ul>";
}

function renderOnboardingChecklist(d) {
  const box = document.querySelector("[data-onboarding-checklist]");
  if (!box) return;
  const role = d && d.role ? d.role : "unknown";
  const checks = [
    ["Cloudflare Access", Boolean(d && d.adminEmail), d && d.adminEmail ? "Signed in as " + d.adminEmail : "Sign in through Cloudflare Access"],
    ["Role separation", Boolean(d && d.role), role === "owner" ? "Owner access active" : role === "assistant" ? "Assistant access active" : "Role not reported"],
    ["Database (D1)", Boolean(d && d.subscribers), d && d.subscribers ? "Subscribers database connected" : "Connect SUBSCRIBERS D1"],
    ["Email sending", Boolean(d && d.resend), d && d.resend ? "Resend configured" : "Add RESEND_API_KEY"],
    ["Unsubscribe/preference links", Boolean(d && d.unsubSecret && d.suppression), d && d.unsubSecret && d.suppression ? "Signed links and suppression connected" : "Add UNSUB_SECRET and SUPPRESSION KV"],
    ["Publishing", Boolean(d && d.github), d && d.github ? "GitHub secret configured" : "Add GitHub publishing secret"],
    ["Image storage", Boolean(d && d.media), d && d.media ? "R2 media storage connected" : "Connect MEDIA R2 bucket"],
    ["Audit log", Boolean(d && d.subscribers), d && d.subscribers ? "Recorded in D1" : "Available after D1 is connected"],
  ];
  box.innerHTML = checks.map(([label, ok, detail]) =>
    '<li class="' + (ok ? "is-complete" : "is-pending") + '"><span>' + escapeHtml(label) + '</span><strong>' +
    escapeHtml(detail) + (ok ? " ✓" : "") + "</strong></li>"
  ).join("");
}

function applyRoleControls() {
  const restricted = [
    "[data-publish-offers]", "[data-publish-reviews]", "[data-publish-prices]", "[data-publish-treatments]", "[data-publish-section]",
    "[data-send-campaign]", "[data-send-test]", "[data-schedule-toggle]", "[data-bday-save]", "[data-bday-test]",
    "[data-media-upload-btn]", "[data-offer-image-upload]", "[data-mail-banner-upload]",
    "[data-subs-export]", "[data-subs-import]", "[data-export-admin]", "[data-import-admin]",
    "[data-add-review]", "[data-import-google]",
  ];
  const assistant = adminRole === "assistant";
  restricted.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      if (assistant) {
        el.disabled = true;
        el.setAttribute("title", "Owner access is required for this action.");
      } else if (el.getAttribute("title") === "Owner access is required for this action.") {
        el.removeAttribute("title");
      }
    });
  });
  if (assistant && !roleToastShown) {
    roleToastShown = true;
    toast("Assistant role active: drafts can be edited, but sending, publishing, deleting and exports require owner access.");
  }
}

/* ---------------- Collapsible cards ---------------- */
// Any card marked [data-collapsible] can be expanded/collapsed by clicking its
// header. State is remembered per card. Keeps data-heavy cards from forcing a
// long scroll as they fill up over time.
function initCollapsibles() {
  document.querySelectorAll("[data-collapsible]").forEach((card) => {
    const head = card.querySelector(".admin-card-head");
    if (!head || head.dataset.collapseBound) return;
    head.dataset.collapseBound = "1";
    head.classList.add("is-collapse-head");
    const key = card.getAttribute("data-collapse-key") || "";
    const storeKey = key ? "lumi-collapse-" + key : "";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "collapse-toggle";
    head.appendChild(toggleBtn);

    let collapsed = card.hasAttribute("data-collapsed");
    if (storeKey) {
      const saved = localStorage.getItem(storeKey);
      if (saved === "1") collapsed = true;
      else if (saved === "0") collapsed = false;
    }
    setCardCollapsed(card, collapsed);

    const doToggle = () => {
      const now = !card.classList.contains("is-collapsed");
      setCardCollapsed(card, now);
      if (storeKey) { try { localStorage.setItem(storeKey, now ? "1" : "0"); } catch { /* ignore */ } }
    };
    toggleBtn.addEventListener("click", (e) => { e.stopPropagation(); doToggle(); });
    // The heading area is also clickable, but not its real controls (e.g. Reload).
    head.addEventListener("click", (e) => {
      if (e.target.closest("button, a, input, select, textarea, label") && !e.target.closest(".collapse-toggle")) return;
      if (e.target.closest(".collapse-toggle")) return; // handled above
      doToggle();
    });
  });
}
function setCardCollapsed(card, on) {
  card.classList.toggle("is-collapsed", on);
  const btn = card.querySelector(".collapse-toggle");
  if (btn) {
    btn.innerHTML = on
      ? '<span class="collapse-caret">▾</span> Show'
      : '<span class="collapse-caret collapse-caret-open">▾</span> Hide';
    btn.setAttribute("aria-expanded", on ? "false" : "true");
    btn.setAttribute("aria-label", (on ? "Show" : "Hide") + " this section");
  }
}

/* ---------------- Dashboard alerts ---------------- */
async function loadAlerts() {
  const card = document.querySelector("[data-alerts-card]");
  const box = document.querySelector("[data-alerts-list]");
  if (!box) return;
  try {
    const res = await fetch("/admin/api/alerts", { cache: "no-store", credentials: "same-origin" });
    const data = await ldReadJson(res);
    const alerts = data.alerts || [];
    if (!alerts.length) { if (card) card.hidden = true; return; }
    if (card) card.hidden = false;
    box.innerHTML = alerts.map((a) => {
      const lvl = a.level === "error" ? "is-error" : a.level === "warn" ? "is-warn" : "is-info";
      const btn = a.tab ? '<button class="tiny-button" type="button" data-alert-go="' + escapeAttr(a.tab) + '">Open</button>' : "";
      return '<div class="alert-item ' + lvl + '"><div><strong>' + escapeHtml(a.title) + "</strong><span>" + escapeHtml(a.detail || "") + "</span></div>" + btn + "</div>";
    }).join("");
    box.querySelectorAll("[data-alert-go]").forEach((b) => b.addEventListener("click", () => {
      const nav = document.querySelector('[data-admin-panel="' + b.dataset.alertGo + '"]');
      if (nav) nav.click();
    }));
  } catch (err) {
    if (card) card.hidden = false;
    box.innerHTML = '<div class="alert-item is-error"><div><strong>Couldn\'t load alerts</strong><span>' + escapeHtml(ldFriendlyError(err)) + "</span></div></div>";
  }
}

/* ---------------- Publish / deploy status ---------------- */
// Compares the repo's latest commit (HEAD) with the version Cloudflare is running
// so the panel can show: last publish time, latest commit, deploy pending/done.
let deployWatch = { timer: null, since: 0 };

async function loadDeployStatus() {
  const box = document.querySelector("[data-deploy-status]");
  if (!box) return null;
  try {
    const res = await fetch("/admin/api/deploy-status", { cache: "no-store", credentials: "same-origin" });
    const d = await ldReadJson(res);
    renderDeployStatus(d, box);
    return d;
  } catch (err) {
    box.innerHTML = '<p class="admin-status is-error">' + escapeHtml(ldFriendlyError(err)) + "</p>";
    return null;
  }
}

function deployPhase(d) {
  if (!d || !d.configured) return "unconfigured";
  if (!d.commit) return "unknown";
  if (!d.deploy || !d.deploy.timestamp) return "nodeploy";
  const dep = Date.parse(d.deploy.timestamp);
  const com = Date.parse(d.commit.date || 0);
  if (isNaN(dep) || isNaN(com)) return "nodeploy";
  if (dep + 20000 >= com) return "deployed"; // live version is at/after the commit (20s skew)
  const elapsed = deployWatch.since ? (Date.now() - deployWatch.since) : (Date.now() - com);
  return elapsed > 5 * 60 * 1000 ? "delayed" : "pending";
}

function renderDeployStatus(d, box) {
  box = box || document.querySelector("[data-deploy-status]");
  if (!box) return;
  if (!d || !d.configured) {
    box.innerHTML = '<p class="admin-help">Publishing isn’t set up on the server yet.</p>';
    return;
  }
  const phase = deployPhase(d);
  const meta = {
    deployed: ["is-ok", "Deployed ✓ — live"],
    pending: ["is-pending", "Deploying…"],
    delayed: ["is-bad", "Taking longer than usual — check Cloudflare"],
    nodeploy: ["is-pending", "Live version unavailable"],
    unknown: ["is-pending", "No commits found"],
  }[phase] || ["is-pending", "Unknown"];
  const c = d.commit, dep = d.deploy;
  const rows = [];
  rows.push('<div class="deploy-row"><span>Deploy</span><strong><em class="status-dot ' + meta[0] + '" aria-hidden="true"></em>' + escapeHtml(meta[1]) + "</strong></div>");
  if (c) {
    const sha = c.url
      ? '<a href="' + escapeAttr(c.url) + '" target="_blank" rel="noopener">' + escapeHtml(c.sha || "") + "</a>"
      : escapeHtml(c.sha || "");
    rows.push('<div class="deploy-row"><span>Latest change</span><strong>' + sha + (c.message ? " · " + escapeHtml(c.message) : "") + "</strong></div>");
    if (c.date) rows.push('<div class="deploy-row"><span>Published</span><strong>' + escapeHtml(auditWhen(c.date)) + (c.author ? " · " + escapeHtml(c.author) : "") + "</strong></div>");
  }
  if (dep && dep.timestamp) rows.push('<div class="deploy-row"><span>Live version</span><strong>' + escapeHtml((dep.tag || dep.id || "—") + " · " + auditWhen(dep.timestamp)) + "</strong></div>");
  box.innerHTML = rows.join("");
}

// Called after a successful publish: poll until the live version catches up.
function startDeployWatch() {
  deployWatch.since = Date.now();
  if (deployWatch.timer) clearInterval(deployWatch.timer);
  loadDeployStatus();
  let tries = 0;
  deployWatch.timer = setInterval(async () => {
    tries += 1;
    const d = await loadDeployStatus();
    const phase = deployPhase(d);
    if (phase === "deployed" || tries >= 40) { // ~5 min max
      clearInterval(deployWatch.timer); deployWatch.timer = null;
      if (phase === "deployed") { deployWatch.since = 0; toast("Deploy complete — your changes are live."); }
    }
  }, 8000);
}

async function loadAuditLog() {
  const body = document.querySelector("[data-audit-log]");
  if (!body) return;
  try {
    const res = await fetch(AUDIT_API, { cache: "no-store", credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ("Could not load the log (" + res.status + ")."));
    renderAuditLog(data.entries || []);
  } catch (err) {
    body.innerHTML = '<tr><td colspan="4">' + escapeHtml(ldFriendlyError(err)) + "</td></tr>";
  }
}

function renderAuditLog(entries) {
  const body = document.querySelector("[data-audit-log]");
  if (!body) return;
  if (!entries.length) { body.innerHTML = '<tr><td colspan="4">No activity recorded yet.</td></tr>'; return; }
  body.innerHTML = entries.map((e) => {
    const warn = (e.status === "denied" || e.status === "error") ? ' class="audit-warn"' : "";
    return "<tr" + warn + "><td>" + escapeHtml(auditWhen(e.created_at)) + "</td><td>" +
      escapeHtml(e.actor || "—") + "</td><td>" + escapeHtml(auditLabel(e.action)) + "</td><td>" +
      escapeHtml(e.detail || "") + "</td></tr>";
  }).join("");
}

/* ---------- Image upload: photo -> R2 media -> offer ---------- */
function bindImageUpload() {
  const input = document.querySelector("[data-offer-image-upload]");
  const status = document.querySelector("[data-image-upload-status]");
  if (!input) return;

  input.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (status) status.textContent = "Uploading " + file.name + "…";

    try {
      // Uploads now go to R2 (returns a /media/... URL). loadMedia() inside
      // uploadMedia refreshes the media cache.
      const url = await uploadMedia(file);
      if (!url) { if (status) status.textContent = "Upload failed."; event.target.value = ""; return; }

      const imageField = document.querySelector('[data-offer-field="image"]');
      if (imageField) imageField.value = url;

      const offer = state.offers[selectedOfferIndex];
      if (offer) { offer.image = url; saveDraft(null); }
      renderOfferPreview();
      updateOfferImageStatus();

      if (status) status.textContent = "Uploaded and selected. Publish the offer to put it live.";
      toast("Photo uploaded.");
    } catch (err) {
      if (status) status.textContent = "Upload failed: " + ldFriendlyError(err);
      toast("Upload failed: " + ldFriendlyError(err));
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
