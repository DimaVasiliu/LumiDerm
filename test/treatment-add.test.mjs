// Proves the "Add a treatment card" flow produces valid tx-card markup and
// appends without disturbing existing cards. buildNewTxFromForm() needs a DOM,
// so we test the data shape it emits directly against the real page renderer
// (prices-template.js) that the admin uses at publish time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// prices-template.js is a browser/CJS IIFE; load it in a vm sandbox so it
// exports through module.exports (the package is type:module, so require() of a
// .js file mis-resolves it).
const code = readFileSync(new URL("../lumi-derm-website/admin/prices-template.js", import.meta.url), "utf8");
const sandbox = { module: { exports: {} } };
vm.runInNewContext(code, sandbox);
const { renderTreatmentLibrary } = sandbox.module.exports;

// The exact object shape buildNewTxFromForm() returns.
function newCard() {
  return {
    id: "dermaplaning-facial",
    title: "Dermaplaning facial",
    sub: "Exfoliating facial &middot; 45 min",
    headline: "from &pound;70",
    service: "",
    bookLabel: "Book now",
    detail: [
      { type: "p", html: "A gentle exfoliating facial that removes dead skin and fine vellus hair." },
      { type: "pricelist", rows: [{ name: "Dermaplaning", cost: "£70", costSmall: "45 min" }] },
      { type: "pill", text: "Up to 15% off off-peak" },
      { type: "note", text: "Consultation confirms suitability before treatment." }
    ]
  };
}

test("new card renders valid tx-card markup", () => {
  const html = renderTreatmentLibrary({ groups: [{ title: "Facials", treatments: [newCard()] }] });
  assert.match(html, /<section class="treatment-group">/);
  assert.match(html, /<h2 class="treatment-group-title">Facials<\/h2>/);
  assert.match(html, /<div class="tx-card" id="dermaplaning-facial" data-tx-card>/);
  assert.match(html, /<span class="tx-title">Dermaplaning facial<\/span>/);
  assert.match(html, /<span class="tx-price">from &pound;70<\/span>/);
  assert.match(html, /<div class="tx-pricelist">/);
  assert.match(html, /<span class="tx-cost">£70<small>45 min<\/small><\/span>/);
  assert.match(html, /<span class="tx-pill">Up to 15% off off-peak<\/span>/);
  assert.match(html, /<p class="tx-note">Consultation confirms suitability before treatment.<\/p>/);
  // No service slug => generic booking link, never a broken deep-link.
  assert.match(html, /href="booking.html">Book now<\/a>/);
});

test("appending a card leaves existing cards untouched", () => {
  const existing = {
    id: "existing-card",
    title: "Existing treatment",
    sub: "Already on the page",
    headline: "from £40",
    service: "existing",
    bookLabel: "Book existing",
    detail: [{ type: "p", html: "Existing copy." }]
  };
  const menu = { groups: [{ title: "Facials", treatments: [existing] }] };
  // Simulate the append the admin does before publishing.
  menu.groups[0].treatments.push(newCard());
  const html = renderTreatmentLibrary(menu);
  assert.match(html, /id="existing-card"/);      // untouched
  assert.match(html, /id="dermaplaning-facial"/); // added
  assert.match(html, /booking.html\?service=existing/); // existing deep-link preserved
});

test("a brand-new group is rendered as its own section", () => {
  const menu = {
    groups: [
      { title: "Facials", treatments: [{ id: "a", title: "A", sub: "", headline: "£1", service: "", bookLabel: "Book", detail: [] }] },
      { title: "New group", treatments: [newCard()] }
    ]
  };
  const html = renderTreatmentLibrary(menu);
  assert.match(html, /<h2 class="treatment-group-title">Facials<\/h2>/);
  assert.match(html, /<h2 class="treatment-group-title">New group<\/h2>/);
  assert.equal((html.match(/<section class="treatment-group">/g) || []).length, 2);
});
