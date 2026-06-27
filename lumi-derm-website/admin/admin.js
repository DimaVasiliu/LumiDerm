/* Lumi Derm Admin — client-side workspace.
   All data persists in localStorage as drafts. Swap the save/load + send
   functions for real API/CMS calls (Square, GitHub, D1) when keys are ready. */

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
  { title: "Laser treatments", category: "Cynosure Elite", price: "from £45", description: "Laser hair removal, rejuvenation and vascular treatment planning.", image: "offer-laser-treatments-cynosure.webp", status: "Published", priority: 1 },
  { title: "Endospheres therapy", category: "Body therapy", price: "from £50", description: "Body-focused lymphatic drainage, smoothing and contour support.", image: "offer-endospheres-therapy.webp", status: "Published", priority: 2 },
  { title: "Skin boosters", category: "Injectable skin support", price: "from £220", description: "Profhilo and polynucleotide treatment plans for hydration support.", image: "offer-skin-boosters.webp", status: "Published", priority: 3 },
  { title: "Facials & peels", category: "Skin polish", price: "from £70", description: "Deep cleansing, dermaplaning, microdermabrasion and tailored peels.", image: "offer-facials.webp", status: "Draft", priority: 4 }
];

const defaultPriceGroups = [
  { id: "laser", label: "Cynosure Elite", title: "Laser treatments", min: "from £10", rows: [["Laser consultation", "£10"], ["Laser hair removal", "from £45"], ["Laser rejuvenation / vascular", "consultation"]] },
  { id: "electrolysis", label: "Apilus", title: "Electrolysis permanent hair removal", min: "from £10", rows: [["Electrolysis consultation", "£10"], ["15 minutes", "£30"], ["30 minutes", "£50"], ["60 minutes", "£100"]] },
  { id: "boosters", label: "Injectable skin support", title: "Skin boosters", min: "from £120", rows: [["Skin boosters consultation", "£10"], ["Profhilo", "£265 / 1 session"], ["Profhilo course", "£490 / 2 sessions"], ["Polynucleotides eyes", "£220 / 1 session"]] },
  { id: "facials", label: "Facials", title: "Facials and skin polish", min: "from £70", rows: [["Facial consultation", "£10"], ["Fire & Ice by IS Clinical + LED", "£90"], ["Bespoke deep cleansing facial", "£100"], ["Microdermabrasion", "£70"]] }
];

const defaultSubscribers = [
  { email: "client@example.com", name: "Sample Client", segment: "All subscribers", consent: "Opted in" }
];

const campaignTemplates = {
  offer: { name: "New offer announcement", audience: "All subscribers", subject: "A little something for your skin ✨", preview: "Our newest treatment offer is here", body: "Hi {first_name},\n\nWe've just added a new offer at Lumi Derm Aesthetics and wanted you to be first to know.\n\n• What it is\n• Who it's perfect for\n• How long it lasts\n\nTap below to book your slot — spaces are limited.\n\nSee you soon,\nIulia", ctaLabel: "Book now", ctaUrl: "https://lumidermaesthetics.com/pages/booking.html" },
  newsletter: { name: "Monthly newsletter", audience: "All subscribers", subject: "Your Lumi Derm glow update", preview: "What's new this month at the clinic", body: "Hi {first_name},\n\nHere's what's new at Lumi Derm this month:\n\n• A new treatment to try\n• A skin tip from Iulia\n• This month's featured offer\n\nWe'd love to see you soon.\n\nIulia", ctaLabel: "See treatments", ctaUrl: "https://lumidermaesthetics.com/pages/services.html" },
  birthday: { name: "Birthday treat", audience: "All subscribers", subject: "Happy birthday — a treat from Lumi Derm 🎁", preview: "A little birthday gift for you", body: "Happy birthday, {first_name}!\n\nTo celebrate, here's a little something to enjoy on your next visit this month.\n\nWith love,\nIulia at Lumi Derm", ctaLabel: "Book your treat", ctaUrl: "https://lumidermaesthetics.com/pages/booking.html" },
  winback: { name: "We miss you (win-back)", audience: "Lapsed clients (90+ days)", subject: "We've missed you at Lumi Derm", preview: "It's been a while — here's a welcome-back offer", body: "Hi {first_name},\n\nIt's been a little while since your last visit and we'd love to see you again. Here's a welcome-back offer to make it easy.\n\nBook whenever suits you.\n\nIulia", ctaLabel: "Rebook now", ctaUrl: "https://lumidermaesthetics.com/pages/booking.html" }
};

const panelTitles = { dashboard: "Overview", offers: "Offers", prices: "Prices", marketing: "Marketing", reviews: "Reviews", media: "Media", content: "Pages", clients: "Clients", settings: "Settings" };

let state = loadDraft();
let selectedOfferIndex = 0;
let selectedPriceGroupId = state.priceGroups[0]?.id || "laser";
let selectedCampaignIndex = -1;

const toastRegion = document.querySelector("[data-admin-toast-region]");

document.addEventListener("DOMContentLoaded", initGate);

/* ---------------- Gate ---------------- */
function initGate() {
  const gate = document.querySelector("[data-admin-gate]");
  const shell = document.querySelector("[data-admin-shell]");
  if (sessionStorage.getItem(UNLOCK_KEY) === "1") {
    gate.hidden = true; shell.hidden = false; runApp(); return;
  }
  gate.hidden = false; shell.hidden = true;
  document.querySelector("[data-gate-form]").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.querySelector("[data-gate-input]");
    const pass = localStorage.getItem(PASS_KEY) || DEFAULT_PASS;
    if (input.value.trim().toLowerCase() === pass.trim().toLowerCase()) {
      sessionStorage.setItem(UNLOCK_KEY, "1");
      gate.hidden = true; shell.hidden = false; runApp();
    } else {
      input.value = ""; input.focus(); toast("Incorrect passcode.");
    }
  });
}

function runApp() {
  bindNavigation();
  bindTopActions();
  bindOffers();
  bindPrices();
  bindMarketing();
  bindReviews();
  bindContent();
  bindSettings();
  bindGenericToasts();
  renderAll();
  loadReviewsFromJson();
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
      subscribers: Array.isArray(s.subscribers) ? s.subscribers : structuredClone(defaultSubscribers),
      savedAt: s.savedAt || null
    };
  } catch {
    return { offers: structuredClone(defaultOffers), priceGroups: structuredClone(defaultPriceGroups), reviews: [], content: {}, campaigns: [], subscribers: structuredClone(defaultSubscribers), savedAt: null };
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
  document.querySelector("[data-publish-demo]")?.addEventListener("click", () => toast("Publish guide: enable Cloudflare Access, connect Sveltia CMS or a protected API, test Square links, then push to GitHub to redeploy."));
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
      ["offers", "priceGroups", "reviews", "campaigns", "subscribers"].forEach((k) => { if (!Array.isArray(state[k])) state[k] = []; });
      selectedOfferIndex = 0; selectedCampaignIndex = -1;
      renderAll(); saveDraft("Backup imported.");
    } catch { toast("That file could not be read as a valid backup."); }
    e.target.value = "";
  };
  reader.readAsText(file);
}

/* ---------------- Offers ---------------- */
function bindOffers() {
  document.querySelector("[data-add-offer]")?.addEventListener("click", () => {
    state.offers.push({ title: "New offer", category: "Draft", price: "from £", description: "Short offer description.", image: imageOptions[0], status: "Draft", priority: state.offers.length + 1 });
    selectedOfferIndex = state.offers.length - 1;
    renderOffers(); saveDraft("Offer added.");
  });
  document.querySelector("[data-save-offer]")?.addEventListener("click", () => {
    const offer = state.offers[selectedOfferIndex]; if (!offer) return;
    document.querySelectorAll("[data-offer-field]").forEach((f) => { offer[f.dataset.offerField] = f.value; });
    renderOffers(); saveDraft("Offer saved.");
  });
  document.querySelectorAll("[data-offer-field]").forEach((f) => f.addEventListener("input", renderOfferPreview));
}

function renderOffers() {
  const table = document.querySelector("[data-offer-table]"); if (!table) return;
  table.innerHTML = state.offers.map((o, i) => `
    <tr>
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
  table.querySelectorAll("[data-del-offer]").forEach((b) => b.addEventListener("click", () => { if (!confirm("Delete this offer?")) return; state.offers.splice(+b.dataset.delOffer, 1); selectedOfferIndex = 0; renderOffers(); saveDraft("Offer deleted."); }));
  populateOfferEditor();
}

function moveOffer(i, dir) {
  const j = i + dir; if (j < 0 || j >= state.offers.length) return;
  [state.offers[i], state.offers[j]] = [state.offers[j], state.offers[i]];
  selectedOfferIndex = j; renderOffers(); saveDraft("Order updated.");
}

function populateOfferEditor() {
  const offer = state.offers[selectedOfferIndex]; if (!offer) return;
  document.querySelectorAll("[data-offer-field]").forEach((f) => { f.value = offer[f.dataset.offerField] || ""; });
  renderOfferPreview();
}

function renderOfferPreview() {
  const box = document.querySelector("[data-offer-preview]"); if (!box) return;
  const get = (k) => document.querySelector(`[data-offer-field="${k}"]`)?.value || "";
  box.innerHTML = `
    <div class="offer-preview-card">
      <img src="../assets/images/${escapeAttr(get("image"))}" alt="" onerror="this.style.display='none'">
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

/* ---------------- Marketing: campaigns ---------------- */
function bindMarketing() {
  document.querySelector("[data-add-campaign]")?.addEventListener("click", () => {
    state.campaigns.unshift({ name: "Untitled campaign", audience: "All subscribers", subject: "", preview: "", body: "", ctaLabel: "Book now", ctaUrl: "https://lumidermaesthetics.com/pages/booking.html", sendDate: "", status: "Draft", template: "" });
    selectedCampaignIndex = 0; renderCampaigns(); populateCampaignEditor(); saveDraft("Campaign created.");
  });
  document.querySelector("[data-campaign-template]")?.addEventListener("change", (e) => {
    const tpl = campaignTemplates[e.target.value]; if (!tpl) return;
    Object.entries(tpl).forEach(([k, v]) => { const f = document.querySelector(`[data-campaign-field="${k}"]`); if (f) f.value = v; });
    renderCampaignPreview();
  });
  document.querySelector("[data-save-campaign]")?.addEventListener("click", () => {
    if (selectedCampaignIndex < 0) { state.campaigns.unshift({}); selectedCampaignIndex = 0; }
    const c = state.campaigns[selectedCampaignIndex];
    document.querySelectorAll("[data-campaign-field]").forEach((f) => { c[f.dataset.campaignField] = f.value; });
    if (!c.name) c.name = c.subject || "Untitled campaign";
    renderCampaigns(); saveDraft("Campaign saved.");
  });
  document.querySelector("[data-copy-campaign]")?.addEventListener("click", () => {
    const get = (k) => document.querySelector(`[data-campaign-field="${k}"]`)?.value || "";
    const text = `Subject: ${get("subject")}\nPreview: ${get("preview")}\n\n${get("body")}\n\n[${get("ctaLabel")}] ${get("ctaUrl")}`;
    navigator.clipboard?.writeText(text).then(() => toast("Campaign text copied — paste into Square Marketing."), () => toast("Copy not available in this browser."));
  });
  document.querySelectorAll("[data-campaign-field]").forEach((f) => f.addEventListener("input", renderCampaignPreview));

  // Subscribers
  document.querySelector("[data-add-sub]")?.addEventListener("click", () => {
    const email = prompt("Subscriber email?"); if (!email) return;
    state.subscribers.push({ email, name: "", segment: "All subscribers", consent: "Opted in" });
    renderSubs(); saveDraft("Subscriber added.");
  });
  document.querySelector("[data-export-subs]")?.addEventListener("click", exportSubs);
  document.querySelector("[data-import-subs]")?.addEventListener("click", () => document.querySelector("[data-subs-file]").click());
  document.querySelector("[data-subs-file]")?.addEventListener("change", importSubs);
}

function renderCampaigns() {
  const list = document.querySelector("[data-campaign-list]"); if (!list) return;
  list.innerHTML = state.campaigns.map((c, i) => `
    <article class="campaign-item ${i === selectedCampaignIndex ? "is-selected" : ""}">
      <div>
        <strong>${escapeHtml(c.name || "Untitled")}</strong>
        <small>${escapeHtml(c.audience || "All subscribers")} · ${escapeHtml(c.status || "Draft")}${c.sendDate ? " · " + escapeHtml(c.sendDate) : ""}</small>
      </div>
      <div class="campaign-actions">
        <button class="tiny-button" type="button" data-edit-campaign="${i}">Edit</button>
        <button class="tiny-button" type="button" data-dup-campaign="${i}">Duplicate</button>
        <button class="tiny-button danger" type="button" data-del-campaign="${i}">Delete</button>
      </div>
    </article>`).join("") || '<p class="admin-help">No campaigns yet. Click “New campaign”.</p>';
  list.querySelectorAll("[data-edit-campaign]").forEach((b) => b.addEventListener("click", () => { selectedCampaignIndex = +b.dataset.editCampaign; renderCampaigns(); populateCampaignEditor(); }));
  list.querySelectorAll("[data-dup-campaign]").forEach((b) => b.addEventListener("click", () => { const c = state.campaigns[+b.dataset.dupCampaign]; state.campaigns.splice(+b.dataset.dupCampaign + 1, 0, { ...c, name: (c.name || "Campaign") + " (copy)", status: "Draft" }); renderCampaigns(); saveDraft("Campaign duplicated."); }));
  list.querySelectorAll("[data-del-campaign]").forEach((b) => b.addEventListener("click", () => { if (!confirm("Delete this campaign?")) return; state.campaigns.splice(+b.dataset.delCampaign, 1); selectedCampaignIndex = -1; renderCampaigns(); saveDraft("Campaign deleted."); }));
}

function populateCampaignEditor() {
  const c = state.campaigns[selectedCampaignIndex]; if (!c) return;
  document.querySelectorAll("[data-campaign-field]").forEach((f) => { f.value = c[f.dataset.campaignField] || ""; });
  renderCampaignPreview();
}

function renderCampaignPreview() {
  const box = document.querySelector("[data-campaign-preview]"); if (!box) return;
  const get = (k) => document.querySelector(`[data-campaign-field="${k}"]`)?.value || "";
  const body = escapeHtml(get("body") || "Your message will appear here.").replace(/\n/g, "<br>");
  box.innerHTML = `
    <div class="email-frame">
      <div class="email-from"><span class="email-avatar">LD</span><div><strong>Lumi Derm Aesthetics</strong><small>${escapeHtml(get("preview") || "Preview text…")}</small></div></div>
      <h4>${escapeHtml(get("subject") || "Your subject line")}</h4>
      <p>${body}</p>
      <span class="email-cta">${escapeHtml(get("ctaLabel") || "Book now")}</span>
      <small class="email-foot">To: ${escapeHtml(get("audience") || "All subscribers")} · Unsubscribe handled by Square</small>
    </div>`;
}

/* ---------------- Subscribers ---------------- */
function renderSubs() {
  const table = document.querySelector("[data-subs-table]"); if (!table) return;
  table.innerHTML = state.subscribers.map((s, i) => `
    <tr>
      <td><strong>${escapeHtml(s.email)}</strong></td>
      <td>${escapeHtml(s.name || "—")}</td>
      <td>${escapeHtml(s.segment || "All subscribers")}</td>
      <td><span class="status-pill">${escapeHtml(s.consent || "Opted in")}</span></td>
      <td><button class="tiny-button danger" type="button" data-del-sub="${i}">Remove</button></td>
    </tr>`).join("") || '<tr><td colspan="5">No subscribers yet. Add or import a list.</td></tr>';
  table.querySelectorAll("[data-del-sub]").forEach((b) => b.addEventListener("click", () => { state.subscribers.splice(+b.dataset.delSub, 1); renderSubs(); saveDraft("Subscriber removed."); }));
}

function exportSubs() {
  const rows = [["email", "name", "segment", "consent"], ...state.subscribers.map((s) => [s.email, s.name || "", s.segment || "", s.consent || ""])];
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  download(`lumi-subscribers-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
  toast("Subscribers exported as CSV.");
}

function importSubs(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
    let added = 0;
    lines.forEach((line, idx) => {
      const cells = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
      const email = cells[0];
      if (!email || !email.includes("@") || (idx === 0 && /email/i.test(email))) return;
      state.subscribers.push({ email, name: cells[1] || "", segment: cells[2] || "All subscribers", consent: cells[3] || "Opted in" });
      added += 1;
    });
    renderSubs(); saveDraft(`${added} subscriber(s) imported.`);
    e.target.value = "";
  };
  reader.readAsText(file);
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
    state.reviews = (data.reviews || []).map((rev, i) => ({ ...rev, status: i < 10 ? "approved" : "pending", featured: i < 3 }));
    renderReviews(); updateMetrics();
  } catch { state.reviews = []; renderReviews(); }
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
    state = loadDraft(); selectedOfferIndex = 0; selectedPriceGroupId = state.priceGroups[0]?.id; selectedCampaignIndex = -1;
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
  renderCampaigns();
  populateCampaignEditor();
  renderCampaignPreview();
  renderSubs();
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
    <article class="media-item"><img src="../assets/images/${escapeAttr(img)}" alt="" loading="lazy" onerror="this.closest('.media-item').style.opacity=0.4"><div><strong>${escapeHtml(img)}</strong><small>Local asset</small></div></article>`).join("");
}

function updateMetrics() {
  setText('[data-metric="offers-published"]', state.offers.filter((o) => o.status === "Published").length);
  setText('[data-metric="reviews-pending"]', state.reviews.filter((r) => r.status === "pending").length);
  setText('[data-metric="campaigns"]', state.campaigns.length);
  setText('[data-metric="subscribers"]', state.subscribers.length);

  const attention = document.querySelector("[data-attention]"); if (!attention) return;
  const items = [];
  const pending = state.reviews.filter((r) => r.status === "pending").length;
  if (pending) items.push(["Reviews to approve", `${pending} pending in the queue`]);
  const drafts = state.offers.filter((o) => o.status === "Draft").length;
  if (drafts) items.push(["Offer drafts", `${drafts} not yet published`]);
  const sched = state.campaigns.filter((c) => c.status === "Scheduled").length;
  if (sched) items.push(["Scheduled campaigns", `${sched} ready to send in Square`]);
  if (!state.subscribers.length) items.push(["No subscribers", "Add or import your opted-in list"]);
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
