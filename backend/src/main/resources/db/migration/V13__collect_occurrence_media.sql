CREATE TABLE occurrence_media (
    id UUID PRIMARY KEY,
    occurrence_id UUID NOT NULL REFERENCES occurrences(id) ON DELETE CASCADE,
    object_key VARCHAR(255) NOT NULL UNIQUE,
    kind VARCHAR(16) NOT NULL CHECK (kind = 'IMAGE'),
    content_type VARCHAR(32) CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes BIGINT CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
    CONSTRAINT occurrence_media_position UNIQUE (occurrence_id, position) DEFERRABLE INITIALLY DEFERRED
);
-- No provider calls: controlled extensions are the only evidence available.
INSERT INTO occurrence_media(id, occurrence_id, object_key, kind, content_type, position)
SELECT gen_random_uuid(), id, image_key, 'IMAGE',
    CASE WHEN image_key ~ '^occurrences/[0-9a-f-]{36}\.jpg$' THEN 'image/jpeg'
         WHEN image_key ~ '^occurrences/[0-9a-f-]{36}\.png$' THEN 'image/png'
         WHEN image_key ~ '^occurrences/[0-9a-f-]{36}\.webp$' THEN 'image/webp' END, 0
FROM occurrences;
ALTER TABLE occurrences DROP COLUMN image_key;
