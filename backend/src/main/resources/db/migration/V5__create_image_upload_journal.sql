CREATE TABLE image_upload_journal (
 image_key varchar(255) PRIMARY KEY,
 state varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','LINKED','TOMBSTONE')),
 created_at timestamptz NOT NULL,
 next_attempt_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 last_error varchar(32),
 CHECK (image_key ~ '^occurrences/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$')
);
CREATE INDEX image_upload_journal_due ON image_upload_journal(next_attempt_at) WHERE state <> 'LINKED';
