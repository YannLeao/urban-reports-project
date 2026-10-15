CREATE TABLE occurrence_notifications (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE REFERENCES occurrence_history(id),
    occurrence_id UUID NOT NULL REFERENCES occurrences(id),
    recipient_id UUID NOT NULL REFERENCES user_accounts(id),
    type VARCHAR(32) NOT NULL,
    message VARCHAR(700) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    read_at TIMESTAMPTZ,
    CONSTRAINT ck_occurrence_notification_type CHECK (type IN ('STATUS_CHANGED', 'OCCURRENCE_REJECTED'))
);
CREATE INDEX ix_occurrence_notifications_recipient
    ON occurrence_notifications(recipient_id, created_at DESC, id DESC);

CREATE FUNCTION create_occurrence_notification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    occurrence_title VARCHAR(100);
BEGIN
    SELECT title INTO occurrence_title FROM occurrences WHERE id = NEW.occurrence_id;
    INSERT INTO occurrence_notifications(
        id, event_id, occurrence_id, recipient_id, type, message, created_at
    )
    VALUES (
        NEW.id,
        NEW.id,
        NEW.occurrence_id,
        (SELECT author_id FROM occurrences WHERE id = NEW.occurrence_id),
        CASE WHEN NEW.new_status = 'REJECTED' THEN 'OCCURRENCE_REJECTED' ELSE 'STATUS_CHANGED' END,
        CASE
            WHEN NEW.new_status = 'REJECTED'
                THEN 'Seu relato "' || occurrence_title || '" foi rejeitado: ' || NEW.reason
            ELSE
                'Seu relato "' || occurrence_title || '" mudou de ' ||
                NEW.previous_status || ' para ' || NEW.new_status || '.'
        END,
        NEW.occurred_at
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER occurrence_history_create_notification
    AFTER INSERT ON occurrence_history
    FOR EACH ROW EXECUTE FUNCTION create_occurrence_notification();
