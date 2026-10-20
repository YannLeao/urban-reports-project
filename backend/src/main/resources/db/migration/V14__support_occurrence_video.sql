ALTER TABLE occurrence_media DROP CONSTRAINT occurrence_media_kind_check;
ALTER TABLE occurrence_media DROP CONSTRAINT occurrence_media_content_type_check;
ALTER TABLE occurrence_media DROP CONSTRAINT occurrence_media_size_bytes_check;
ALTER TABLE occurrence_media ADD COLUMN duration_seconds double precision;
ALTER TABLE occurrence_media ADD COLUMN width integer;
ALTER TABLE occurrence_media ADD COLUMN height integer;
ALTER TABLE occurrence_media ADD CONSTRAINT occurrence_media_contract CHECK (
 (kind = 'IMAGE' AND (content_type IS NULL OR content_type IN ('image/jpeg','image/png','image/webp'))
  AND (size_bytes IS NULL OR size_bytes BETWEEN 1 AND 5242880)
  AND duration_seconds IS NULL AND width IS NULL AND height IS NULL)
 OR
 (kind = 'VIDEO' AND content_type IS NOT NULL AND content_type = 'video/mp4'
  AND size_bytes IS NOT NULL AND size_bytes BETWEEN 1 AND 26214400
  AND duration_seconds IS NOT NULL AND duration_seconds > 0 AND duration_seconds <= 30.000002
  AND width IS NOT NULL AND height IS NOT NULL AND width > 0 AND height > 0
  AND greatest(width,height) <= 1280 AND least(width,height) <= 720 AND width::bigint * height <= 921600
  AND position = 0 AND object_key ~ '^occurrences/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$')
);
ALTER TABLE image_upload_journal DROP CONSTRAINT image_upload_journal_image_key_check;
ALTER TABLE image_upload_journal ADD CONSTRAINT image_upload_journal_image_key_check
 CHECK (image_key ~ '^occurrences/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|mp4)$');

CREATE FUNCTION check_occurrence_media_collection() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE report_id uuid; amount integer; videos integer;
BEGIN
 IF TG_TABLE_NAME = 'occurrences' THEN
  report_id := NEW.id;
 ELSIF TG_OP = 'DELETE' THEN
  report_id := OLD.occurrence_id;
 ELSE
  report_id := NEW.occurrence_id;
 END IF;
 IF TG_TABLE_NAME = 'occurrence_media' THEN
  IF TG_OP = 'UPDATE' THEN
   IF OLD.occurrence_id <> NEW.occurrence_id THEN
    RAISE EXCEPTION 'Media ownership is immutable' USING ERRCODE = '23514';
   END IF;
  END IF;
 END IF;
 -- Serialize deferred checks too; NO KEY UPDATE remains compatible with FK key-share locks.
 PERFORM 1 FROM occurrences WHERE id = report_id FOR NO KEY UPDATE;
 IF FOUND THEN
  SELECT count(*), count(*) FILTER (WHERE kind = 'VIDEO') INTO amount, videos
   FROM occurrence_media WHERE occurrence_id = report_id;
  IF amount < 1 OR amount > 5 OR (videos > 0 AND (videos <> 1 OR amount <> 1)) THEN
   RAISE EXCEPTION 'Invalid occurrence media collection' USING ERRCODE = '23514';
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER occurrence_media_collection AFTER INSERT OR UPDATE OR DELETE ON occurrence_media
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_occurrence_media_collection();
CREATE CONSTRAINT TRIGGER occurrence_requires_media AFTER INSERT ON occurrences
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_occurrence_media_collection();
