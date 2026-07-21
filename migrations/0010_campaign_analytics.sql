-- Lumi Derm — decision-grade campaign analytics.
-- Stores the topic each campaign was sent as, plus manual booking/revenue
-- attribution the team records after a campaign.
-- Apply with:  npx wrangler d1 migrations apply lumidermdb --remote

ALTER TABLE campaign_sends ADD COLUMN topic TEXT;   -- offers | skintips | news (segment sent)

CREATE TABLE IF NOT EXISTS campaign_attribution (
  campaign_id TEXT PRIMARY KEY,
  bookings    INTEGER NOT NULL DEFAULT 0,
  revenue     REAL    NOT NULL DEFAULT 0,
  note        TEXT,
  updated_at  TEXT
);
