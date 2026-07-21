-- Lumi Derm — reset the D1 reviews table.
-- The established Treatwell reviews now live in assets/data/reviews.json and are
-- served on the homepage automatically (merged + de-duplicated by the Worker).
-- The admin's D1 reviews table is only for NEW reviews from here on, so we clear
-- the leftover seeded rows and let it start empty.
-- Apply with:  npx wrangler d1 migrations apply lumidermdb --remote

DELETE FROM reviews;
