-- Lumi Derm — saved campaign drafts
-- Apply with:
--   npx wrangler d1 migrations apply lumidermdb --remote

CREATE TABLE IF NOT EXISTS campaign_drafts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  payload     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_drafts_updated ON campaign_drafts (updated_at);
