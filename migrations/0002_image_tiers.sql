ALTER TABLE photos ADD COLUMN thumb_key TEXT;
ALTER TABLE photos ADD COLUMN canvas_key TEXT;
CREATE INDEX IF NOT EXISTS idx_photos_captured_at ON photos(captured_at);