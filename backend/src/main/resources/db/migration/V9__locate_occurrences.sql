-- No backfill: legacy rows intentionally keep an absent pair.
ALTER TABLE occurrences
    ADD COLUMN latitude double precision,
    ADD COLUMN longitude double precision,
    ADD CONSTRAINT ck_occurrences_location CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (latitude IS NOT NULL AND longitude IS NOT NULL
            AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    );
