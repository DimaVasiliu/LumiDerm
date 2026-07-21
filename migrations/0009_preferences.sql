-- Lumi Derm — richer subscriber email preferences.
-- Topic opt-ins, a frequency cap, and a temporary pause, all set from the
-- preference centre linked in every marketing email.
-- Existing subscribers keep receiving everything (defaults = opted in).
-- Apply with:  npx wrangler d1 migrations apply lumidermdb --remote

ALTER TABLE subscribers ADD COLUMN pref_offers    INTEGER NOT NULL DEFAULT 1;  -- offers & promotions
ALTER TABLE subscribers ADD COLUMN pref_skintips  INTEGER NOT NULL DEFAULT 1;  -- skin tips & advice
ALTER TABLE subscribers ADD COLUMN pref_news      INTEGER NOT NULL DEFAULT 1;  -- clinic news & updates
ALTER TABLE subscribers ADD COLUMN pref_birthday  INTEGER NOT NULL DEFAULT 1;  -- birthday treats
ALTER TABLE subscribers ADD COLUMN pref_frequency TEXT    NOT NULL DEFAULT 'any';  -- any | monthly
ALTER TABLE subscribers ADD COLUMN pause_until    TEXT;    -- ISO date; NULL = not paused
ALTER TABLE subscribers ADD COLUMN last_emailed_at TEXT;   -- last marketing email sent (for the monthly cap)

-- Scheduled campaigns remember their topic so the cron send can filter by it.
ALTER TABLE scheduled_campaigns ADD COLUMN topic TEXT;
