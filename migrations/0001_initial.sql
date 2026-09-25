CREATE TABLE IF NOT EXISTS photos (
 id TEXT PRIMARY KEY, r2_key TEXT NOT NULL, preview_key TEXT, created_at TEXT NOT NULL,
 captured_at TEXT, caption TEXT, location TEXT, event TEXT, person TEXT, pet TEXT,
 ai_labels TEXT, tags TEXT, width INTEGER, height INTEGER, size_bytes INTEGER,
 mime_type TEXT, status TEXT NOT NULL DEFAULT 'ready'
);
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at);
CREATE INDEX IF NOT EXISTS idx_photos_event ON photos(event);
CREATE INDEX IF NOT EXISTS idx_photos_location ON photos(location);
CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(status);
CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS photo_tags (photo_id TEXT NOT NULL,tag_id TEXT NOT NULL,PRIMARY KEY(photo_id,tag_id));