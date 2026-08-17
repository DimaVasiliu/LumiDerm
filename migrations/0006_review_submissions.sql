-- Lumi Derm — client review submissions (from the website "Leave a review" form)
-- Submitted reviews land here as 'pending' and appear in Admin → Reviews for
-- the clinic owner to approve (import into the review list) or reject. Nothing is public
-- until she approves and publishes it.
-- Apply with:
--   npx wrangler d1 migrations apply lumidermdb --remote

CREATE TABLE IF NOT EXISTS review_submissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT,
  rating      INTEGER,                 -- 1-5
  treatment   TEXT,
  text        TEXT NOT NULL,
  email       TEXT,                    -- optional, for follow-up; never published
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | imported | rejected
  ip          TEXT,
  created_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_review_sub_status ON review_submissions (status);
