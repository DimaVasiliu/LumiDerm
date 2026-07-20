-- Lumi Derm — email campaign send history
-- Apply with:
--   npx wrangler d1 migrations apply lumidermdb --remote

CREATE TABLE IF NOT EXISTS campaign_sends (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subject         TEXT NOT NULL,
  audience_source TEXT NOT NULL DEFAULT 'manual',
  is_test         INTEGER NOT NULL DEFAULT 0,
  requested_count INTEGER NOT NULL DEFAULT 0,
  sent_count      INTEGER NOT NULL DEFAULT 0,
  suppressed_count INTEGER NOT NULL DEFAULT 0,
  invalid_count   INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'sent',
  error_summary   TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_created ON campaign_sends (created_at);
