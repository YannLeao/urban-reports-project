-- Shared message template for new transitions and durable intents predating the central.
CREATE FUNCTION occurrence_notification_message(title TEXT, previous_status TEXT, new_status TEXT, reason TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN new_status = 'REJECTED'
        THEN 'Seu relato "' || title || '" foi rejeitado: ' || reason
        ELSE 'Seu relato "' || title || '" mudou de ' ||
            CASE previous_status WHEN 'PENDING' THEN 'Pendente' WHEN 'IN_ANALYSIS' THEN 'Em análise' ELSE previous_status END ||
            ' para ' || CASE new_status WHEN 'IN_ANALYSIS' THEN 'Em análise' WHEN 'RESOLVED' THEN 'Resolvida' ELSE new_status END || '.'
    END;
$$;

CREATE OR REPLACE FUNCTION create_occurrence_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO occurrence_notifications(id, event_id, occurrence_id, recipient_id, type, message, created_at)
        SELECT NEW.id, NEW.id, NEW.occurrence_id, author_id,
            CASE WHEN NEW.new_status = 'REJECTED' THEN 'OCCURRENCE_REJECTED' ELSE 'STATUS_CHANGED' END,
            occurrence_notification_message(title, NEW.previous_status, NEW.new_status, NEW.reason), NEW.occurred_at
        FROM occurrences WHERE id = NEW.occurrence_id;
    RETURN NEW;
END;
$$;

-- Keep V10 notifications and materialize earlier intents with the same event identity.
INSERT INTO occurrence_notifications(id, event_id, occurrence_id, recipient_id, type, message, created_at)
SELECT h.id, h.id, h.occurrence_id, o.recipient_id,
    CASE WHEN h.new_status = 'REJECTED' THEN 'OCCURRENCE_REJECTED' ELSE 'STATUS_CHANGED' END,
    occurrence_notification_message(r.title, h.previous_status, h.new_status, h.reason), h.occurred_at
FROM occurrence_notification_outbox o
JOIN occurrence_history h ON h.id = o.event_id
JOIN occurrences r ON r.id = h.occurrence_id
ON CONFLICT (event_id) DO NOTHING;

CREATE INDEX ix_occurrence_notifications_unread
    ON occurrence_notifications(recipient_id) WHERE read_at IS NULL;
