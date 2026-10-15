ALTER TABLE occurrences DROP CONSTRAINT ck_occurrences_status;
ALTER TABLE occurrences ADD CONSTRAINT ck_occurrences_status
    CHECK (status IN ('PENDING', 'IN_ANALYSIS', 'RESOLVED', 'REJECTED'));

CREATE TABLE occurrence_history (
    id UUID PRIMARY KEY,
    occurrence_id UUID NOT NULL REFERENCES occurrences(id),
    previous_status VARCHAR(32) NOT NULL,
    new_status VARCHAR(32) NOT NULL,
    moderator_id UUID NOT NULL REFERENCES user_accounts(id),
    occurred_at TIMESTAMPTZ NOT NULL,
    reason VARCHAR(500),
    version BIGINT NOT NULL CHECK (version > 0),
    CONSTRAINT uk_occurrence_history_version UNIQUE (occurrence_id, version),
    CONSTRAINT ck_occurrence_history_transition CHECK (
        (previous_status = 'PENDING' AND new_status IN ('IN_ANALYSIS', 'REJECTED')) OR
        (previous_status = 'IN_ANALYSIS' AND new_status IN ('RESOLVED', 'REJECTED'))),
    CONSTRAINT ck_occurrence_history_reason CHECK (
        (new_status = 'REJECTED' AND reason IS NOT NULL AND char_length(reason) BETWEEN 10 AND 500
            AND reason = btrim(reason, E'\t\n\013\014\r ')) OR
        (new_status <> 'REJECTED' AND reason IS NULL))
);
CREATE INDEX ix_occurrence_history_order ON occurrence_history(occurrence_id, occurred_at, version);

-- Intent only: delivery belongs to the notifications integration. The event ID
-- is the deduplication key, including retries after a consumer restart.
CREATE TABLE occurrence_notification_outbox (
    event_id UUID PRIMARY KEY REFERENCES occurrence_history(id),
    recipient_id UUID NOT NULL REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ NOT NULL
);

CREATE FUNCTION preserve_occurrence_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Occurrence history is append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER occurrence_history_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON occurrence_history
    FOR EACH STATEMENT EXECUTE FUNCTION preserve_occurrence_history();

CREATE FUNCTION enqueue_occurrence_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO occurrence_notification_outbox(event_id, recipient_id, created_at)
        SELECT NEW.id, author_id, NEW.occurred_at FROM occurrences WHERE id = NEW.occurrence_id;
    RETURN NEW;
END;
$$;
CREATE TRIGGER occurrence_history_notification
    AFTER INSERT ON occurrence_history FOR EACH ROW EXECUTE FUNCTION enqueue_occurrence_transition();
