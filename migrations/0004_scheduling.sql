-- Lumi Derm — scheduled sends + automatic birthday emails
-- Apply with:
--   npx wrangler d1 migrations apply lumidermdb --remote

-- Campaigns queued to send at a future time. The hourly cron sends the due ones.
CREATE TABLE IF NOT EXISTS scheduled_campaigns (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subject         TEXT NOT NULL,
  html            TEXT NOT NULL,
  audience_source TEXT,                              -- label for history, e.g. "website"
  recipients      TEXT NOT NULL,                     -- JSON array [{email,name}] resolved at schedule time
  send_at         TEXT NOT NULL,                     -- ISO timestamp (UTC) — send when now >= this
  status          TEXT NOT NULL DEFAULT 'queued',    -- queued | sent | cancelled | error
  created_at      TEXT NOT NULL,
  sent_at         TEXT,
  result          TEXT                               -- short outcome summary
);

CREATE INDEX IF NOT EXISTS idx_sched_status_time ON scheduled_campaigns (status, send_at);

-- Small key/value store for admin settings (birthday automation config lives here).
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,        -- JSON blob
  updated_at TEXT
);

-- Track the last year a subscriber received a birthday email, so nobody gets two.
ALTER TABLE subscribers ADD COLUMN birthday_sent_year INTEGER;
