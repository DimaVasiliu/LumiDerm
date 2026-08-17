-- Lumi Derm — live prices + page text served from D1 (edge-rendered).
-- The admin saves structured content here (for editing) plus the rendered HTML
-- fragments per marker region; the Worker injects those fragments into the
-- static pages server-side, so edits are instant AND search engines still see
-- the real content. If a fragment is missing, the Worker serves the static page
-- unchanged (fail-safe).
-- Apply once with:
--   npx wrangler d1 migrations apply lumidermdb --remote

CREATE TABLE IF NOT EXISTS site_content (
  key        TEXT PRIMARY KEY,   -- 'content' | 'prices' | 'frag:HERO' | 'frag:PRICES' | ...
  value      TEXT NOT NULL,      -- JSON (structured) or HTML (fragment)
  updated_at TEXT
);
