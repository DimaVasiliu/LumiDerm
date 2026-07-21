-- Lumi Derm — durable, server-side version history (revisions).
-- Snapshots of offers / prices / page text / reviews so the team can roll back
-- from any device, not just the browser that made the change.
-- Apply with:  npx wrangler d1 migrations apply lumidermdb --remote

CREATE TABLE IF NOT EXISTS revisions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,               -- offers | prices | content | reviews
  label       TEXT,                        -- e.g. "Before publishing offers"
  payload     TEXT NOT NULL,               -- JSON snapshot of that section
  actor       TEXT,                        -- admin email that created it
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revisions_kind ON revisions (kind, id DESC);
