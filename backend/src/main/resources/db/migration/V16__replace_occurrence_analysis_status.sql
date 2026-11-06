ALTER TABLE occurrences DROP CONSTRAINT ck_occurrences_status;
UPDATE occurrences SET status = 'ACCEPTED' WHERE status = 'IN_ANALYSIS';
ALTER TABLE occurrences ADD CONSTRAINT ck_occurrences_status
    CHECK (status IN ('PENDING', 'ACCEPTED', 'RESOLVED', 'REJECTED'));

ALTER TABLE occurrence_history DROP CONSTRAINT ck_occurrence_history_transition;
ALTER TABLE occurrence_history ADD CONSTRAINT ck_occurrence_history_transition CHECK (
    (previous_status = 'PENDING' AND new_status IN ('ACCEPTED', 'REJECTED')) OR
    (previous_status = 'ACCEPTED' AND new_status = 'RESOLVED') OR
    (previous_status = 'IN_ANALYSIS' AND new_status IN ('RESOLVED', 'REJECTED'))
);

ALTER TABLE occurrence_history DROP CONSTRAINT ck_occurrence_history_reason;
ALTER TABLE occurrence_history ADD CONSTRAINT ck_occurrence_history_reason CHECK (
    (new_status IN ('ACCEPTED', 'REJECTED') AND reason IS NOT NULL
        AND char_length(reason) BETWEEN 10 AND 500
        AND reason = btrim(reason, E'\t\n\013\014\r ')) OR
    (new_status = 'IN_ANALYSIS' AND reason IS NULL) OR
    (new_status = 'RESOLVED' AND reason IS NULL)
);

CREATE OR REPLACE FUNCTION create_occurrence_notification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    occurrence_title VARCHAR(100);
    previous_label VARCHAR(32);
    new_label VARCHAR(32);
BEGIN
    SELECT title INTO occurrence_title FROM occurrences WHERE id = NEW.occurrence_id;
    previous_label := CASE NEW.previous_status
        WHEN 'PENDING' THEN 'Pendente'
        WHEN 'IN_ANALYSIS' THEN 'Aceita'
        WHEN 'ACCEPTED' THEN 'Aceita'
        WHEN 'RESOLVED' THEN 'Resolvida'
        WHEN 'REJECTED' THEN 'Rejeitada'
    END;
    new_label := CASE NEW.new_status
        WHEN 'PENDING' THEN 'Pendente'
        WHEN 'IN_ANALYSIS' THEN 'Aceita'
        WHEN 'ACCEPTED' THEN 'Aceita'
        WHEN 'RESOLVED' THEN 'Resolvida'
        WHEN 'REJECTED' THEN 'Rejeitada'
    END;
    INSERT INTO occurrence_notifications(
        id, event_id, occurrence_id, recipient_id, type, message, created_at
    )
    VALUES (
        NEW.id, NEW.id, NEW.occurrence_id,
        (SELECT author_id FROM occurrences WHERE id = NEW.occurrence_id),
        CASE WHEN NEW.new_status = 'REJECTED' THEN 'OCCURRENCE_REJECTED' ELSE 'STATUS_CHANGED' END,
        CASE WHEN NEW.new_status IN ('ACCEPTED', 'REJECTED')
            THEN 'Seu relato "' || occurrence_title || '" foi ' || lower(new_label) || ': ' || NEW.reason
            ELSE 'Seu relato "' || occurrence_title || '" mudou de ' || previous_label || ' para ' || new_label || '.'
        END,
        NEW.occurred_at
    );
    RETURN NEW;
END;
$$;
