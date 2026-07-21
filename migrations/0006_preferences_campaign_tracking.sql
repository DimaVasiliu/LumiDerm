-- Lumi Derm — subscriber preferences + campaign performance
-- Apply with:
--   npx wrangler d1 migrations apply lumidermdb --remote

ALTER TABLE campaign_sends ADD COLUMN campaign_id TEXT;

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign_id ON campaign_sends (campaign_id);

CREATE TABLE IF NOT EXISTS campaign_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL,
  email       TEXT,
  event_type  TEXT NOT NULL, -- click | unsubscribe | failed
  detail      TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign ON campaign_events (campaign_id, event_type);
CREATE INDEX IF NOT EXISTS idx_campaign_events_email ON campaign_events (email);
