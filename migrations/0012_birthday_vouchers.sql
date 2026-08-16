-- Lumi Derm — birthday voucher codes (venue-only 15% birthday treat)
-- One row per birthday email sent. The code is shown to staff in-studio; the
-- token is the unguessable value in the email link. Redeemed manually in admin.
-- Apply once with:
--   npx wrangler d1 migrations apply lumidermdb --remote

CREATE TABLE IF NOT EXISTS birthday_vouchers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,            -- human-friendly, e.g. BDAY-8K4P
  token         TEXT NOT NULL UNIQUE,            -- unguessable, used in the email link
  email         TEXT NOT NULL,
  subscriber_id INTEGER,
  name          TEXT,
  discount      INTEGER NOT NULL DEFAULT 15,     -- percent off one treatment
  status        TEXT NOT NULL DEFAULT 'active',  -- active | requested | redeemed | expired | cancelled
  issued_at     TEXT NOT NULL,                   -- ISO timestamp
  expires_at    TEXT NOT NULL,                   -- issued_at + 30 days

  -- appointment request (filled when the client submits the form on the page)
  req_treatment TEXT,
  req_times     TEXT,
  req_phone     TEXT,
  req_message   TEXT,
  requested_at  TEXT,

  -- redemption (staff mark it off in the admin)
  redeemed_at   TEXT,
  redeemed_by   TEXT
);

CREATE INDEX IF NOT EXISTS idx_bvouchers_token  ON birthday_vouchers (token);
CREATE INDEX IF NOT EXISTS idx_bvouchers_email  ON birthday_vouchers (email);
CREATE INDEX IF NOT EXISTS idx_bvouchers_status ON birthday_vouchers (status);
