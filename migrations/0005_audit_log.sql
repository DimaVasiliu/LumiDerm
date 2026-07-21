-- Lumi Derm — admin audit log
-- Records who did what and when (OWASP: admin actions, data export, auth/access
-- failures, config changes, opt-ins). Written server-side by the Worker.
-- Apply with:
--   npx wrangler d1 migrations apply lumidermdb --remote

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,            -- ISO timestamp (UTC)
  actor       TEXT,                     -- admin email (from Cloudflare Access), or subject email for opt-ins
  action      TEXT NOT NULL,            -- e.g. campaign.send, publish.offers, subscriber.delete, auth.denied
  detail      TEXT,                     -- short human summary (subject, counts, target, path)
  ip          TEXT,                     -- cf-connecting-ip
  status      TEXT                      -- ok | error | denied
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_log (action);
