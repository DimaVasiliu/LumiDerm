-- Lumi Derm — newsletter / marketing subscribers
-- Personal data lives here (Cloudflare D1), never in the git repo.
-- Apply once with:
--   npx wrangler d1 migrations apply lumidermdb --remote

CREATE TABLE IF NOT EXISTS subscribers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  first_name      TEXT,
  last_name       TEXT,
  birth_day       INTEGER,          -- 1-31, optional (for birthday offers)
  birth_month     INTEGER,          -- 1-12, optional
  interest        TEXT,             -- e.g. "laser", "skin", "body"
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | unsubscribed

  -- Record of consent (ICO: who / when / how)
  consent_email   INTEGER NOT NULL DEFAULT 0,       -- 1 = ticked the email-marketing box
  consent_wording TEXT,             -- the exact text they agreed to
  consent_source  TEXT,             -- where it was collected, e.g. "website popup"
  signup_ip       TEXT,             -- IP at signup, for accountability

  confirm_token   TEXT,             -- double opt-in token (cleared once confirmed)
  created_at      TEXT,             -- ISO timestamp: form submitted
  confirmed_at    TEXT,             -- ISO timestamp: double opt-in link clicked
  unsubscribed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers (status);
CREATE INDEX IF NOT EXISTS idx_subscribers_token ON subscribers (confirm_token);
