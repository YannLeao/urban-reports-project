ALTER TABLE occurrences ALTER COLUMN description DROP NOT NULL;
ALTER TABLE occurrences DROP CONSTRAINT ck_occurrences_description_length;
ALTER TABLE occurrences ADD CONSTRAINT ck_occurrences_description_length CHECK (description IS NULL OR char_length(description) <= 1000);
ALTER TABLE occurrences ADD COLUMN version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0);
