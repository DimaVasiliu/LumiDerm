-- Lumi Derm — homepage offers, served live from D1 (like reviews).
-- After this, "Publish offers" in the admin writes here instead of committing to
-- GitHub, so offers change instantly with no deploy.
-- Apply once with:
--   npx wrangler d1 migrations apply lumidermdb --remote

CREATE TABLE IF NOT EXISTS offers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  category     TEXT,
  description  TEXT,
  price        TEXT,
  badge        TEXT,
  image        TEXT,
  alt          TEXT,
  service      TEXT,
  status       TEXT NOT NULL DEFAULT 'live',   -- live | draft
  featured     INTEGER NOT NULL DEFAULT 0,      -- 1 = shown first
  expires      TEXT,                            -- YYYY-MM-DD, '' = no expiry
  note         TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT,
  updated_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_offers_status ON offers (status);
CREATE INDEX IF NOT EXISTS idx_offers_sort   ON offers (featured DESC, sort_order ASC);

-- Seed the offers currently on the website (3 live + 1 hidden draft placeholder).
INSERT INTO offers (title, category, description, price, badge, image, alt, service, status, featured, expires, note, sort_order, created_at, updated_at) VALUES
  ('Any peel — course of 3', 'Skin peels', 'Glycolic, salicylic or azelaic — a course of three, saving versus single sessions.', '£195', 'Course', 'assets/images/offer-peels.webp', '', 'facial-peels', 'live', 0, '', 'Ongoing offer', 0, '2026-08-17T00:00:00Z', '2026-08-17T00:00:00Z'),
  ('Microneedling + exosome glow', 'Advanced skin', 'Collagen-boosting microneedling supercharged with an exosome finish.', 'From £150', 'New', 'assets/images/offer-microneedling.webp', '', 'microneedling', 'live', 0, '', 'Limited time', 1, '2026-08-17T00:00:00Z', '2026-08-17T00:00:00Z'),
  ('August offer 20% off on Laser Hair Removal', 'Laser Hair Removal', 'August offer- Save 20% on any Laser Hair Removal package or single session', '£32', '20% off', 'assets/images/offer-laser-treatments-cynosure.webp', '', 'laser-hair-removal', 'live', 0, '2026-08-31', 'Ongoing offer', 2, '2026-08-17T00:00:00Z', '2026-08-17T00:00:00Z'),
  ('New offer', 'Offer', 'Short offer description.', 'From £', '', '/media/uploads/mswtahag-404ac123.webp', '', '', 'draft', 0, '', 'Ongoing offer', 3, '2026-08-17T00:00:00Z', '2026-08-17T00:00:00Z');
