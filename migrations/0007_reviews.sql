-- Lumi Derm — live reviews served from D1 (no publish/deploy needed).
-- The homepage reads GET /api/reviews (approved only, featured first).
-- Admin approve/hide/feature writes here and is live immediately.
-- Apply with:  npx wrangler d1 migrations apply lumidermdb --remote

CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT,
  initial     TEXT,
  rating      INTEGER NOT NULL DEFAULT 5,
  treatment   TEXT,
  source      TEXT,
  text        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- approved | pending | hidden
  featured    INTEGER NOT NULL DEFAULT 0,        -- 0/1
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews (status);

CREATE TABLE IF NOT EXISTS review_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Summary badge (only set if missing).
INSERT OR IGNORE INTO review_meta (key, value) VALUES ('rating', '5.0');
INSERT OR IGNORE INTO review_meta (key, value) VALUES ('count', '47');
INSERT OR IGNORE INTO review_meta (key, value) VALUES ('label', 'Treatwell reviews');

-- Seed current homepage reviews as approved, but ONLY the first time this
-- migration runs (guarded by the 'reviews_seeded' marker set at the end).
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Elena','E',5,'Lymphatic Drainage','Client feedback','The practitioner is highly experienced and I have complete confidence in her expertise. The studio is clean, comfortable, and fully equipped to ensure a great experience and quality treatment. I would highly recommend her.','approved',0,0,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Tatjana','T',5,'Cellulite Treatment','Client feedback','The practitioner is lovely from the very first visit. Kind, attentive, with truly magical hands. After her treatments you feel light, happy, and full of energy. Her facial treatments are simply amazing, with a cozy space, calming atmosphere, and genuine care.','approved',0,1,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Natalia','N',5,'Lash Lift','Client feedback','I was slightly late but the practitioner was accommodating and efficient, so we finished the procedure on time. I love the result!','approved',0,2,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Narona','N',5,'Facial Treatment','Treatwell','A calm, professional experience with attentive care and a refreshed feeling after the visit.','approved',0,3,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Clare','C',5,'Electrolysis','Treatwell','Precise treatment in a welcoming studio, with friendly service and a confident finish.','approved',0,4,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Maria','M',5,'Beauty Treatments','Client feedback','Yulia is a really professional and caring beauty therapist. She always gives good advice based on your needs. I have been going to her for many years now and can definitely recommend her services.','approved',0,5,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Alice','A',5,'Laser Hair Removal','Client feedback','Lovely and clean, and the treatment went really well.','approved',0,6,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Fatemeh','F',5,'Electrolysis','Client feedback','The practitioner is highly professional, skilled, and very friendly.','approved',0,7,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Anatolii','A',5,'Electrolysis','Client feedback','Professional, friendly therapist. Nice atmosphere.','approved',0,8,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Natalie','N',5,'Cellulite Treatment','Client feedback','Exceptional service, thank you!','approved',0,9,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Amelia','A',5,'Laser Hair Removal','Client feedback','Fantastic experience with the practitioner.','approved',0,10,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Alice','A',5,'Electrolysis','Client feedback','Brilliant.','approved',0,11,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Roisin','R',5,'Hollywood Waxing','Client feedback','A welcoming visit with a comfortable experience and clear care throughout the appointment.','approved',0,12,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Alice','A',5,'Electrolysis','Client feedback','A perfect appointment with careful treatment and a calm finish.','approved',0,13,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Clare','C',5,'Electrolysis','Client feedback','Excellent service in a friendly, professional studio.','approved',0,14,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Sayed','S',5,'Laser Hair Removal','Client feedback','Careful laser treatment with a reassuring appointment and smooth experience.','approved',0,15,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Elena','E',5,'Lymphatic Drainage','Client feedback','A professional visit with a clean studio, comfortable setting, and confident care.','approved',0,16,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Sarra','S',5,'Laser Hair Removal','Treatwell','A friendly and reassuring appointment with careful treatment and clear guidance throughout.','approved',0,17,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Roisin','R',5,'Waxing','Treatwell','A comfortable appointment with a thoughtful approach and a smooth, efficient treatment.','approved',0,18,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');
INSERT INTO reviews (name,initial,rating,treatment,source,text,status,featured,sort_order,created_at) SELECT 'Alice','A',5,'Laser Hair Removal','Treatwell','Clean surroundings, professional care and a treatment experience that felt easy from start to finish.','approved',0,19,'2026-07-21T00:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM review_meta WHERE key='reviews_seeded');

INSERT OR IGNORE INTO review_meta (key, value) VALUES ('reviews_seeded', '1');
