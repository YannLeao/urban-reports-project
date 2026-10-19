-- Capture only inserts after this transactional migration. No historical backfill.
CREATE TABLE occurrence_notification_email_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL UNIQUE REFERENCES occurrence_notifications(id),
    state VARCHAR(16) NOT NULL DEFAULT 'PENDING'
        CHECK (state IN ('PENDING','PROCESSING','ACCEPTED','FAILED','UNCERTAIN','SUPPRESSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    reservation_attempts BIGINT NOT NULL DEFAULT 0 CHECK (reservation_attempts >= 0),
    reserved_at TIMESTAMPTZ,
    lease_until TIMESTAMPTZ,
    owner_token UUID,
    send_id UUID,
    completed_at TIMESTAMPTZ,
    diagnostic VARCHAR(32) NOT NULL DEFAULT 'NONE'
        CHECK (diagnostic IN ('NONE','ACCEPTED','LEASE_EXPIRED','INELIGIBLE_RECIPIENT',
            'TRANSPORT_FAILURE','UNEXPECTED_FAILURE','OPERATOR_CONFIRMED','OPERATOR_RELEASED')),
    category VARCHAR(16) CHECK (category IN ('CONFIGURATION','PERMANENT','TRANSIENT','UNCERTAIN')),
    http_status INTEGER CHECK (http_status BETWEEN 100 AND 599),
    CHECK ((state = 'PROCESSING' AND owner_token IS NOT NULL AND reserved_at IS NOT NULL
            AND lease_until IS NOT NULL AND lease_until > reserved_at AND send_id IS NOT NULL)
        OR (state <> 'PROCESSING' AND owner_token IS NULL AND reserved_at IS NULL AND lease_until IS NULL)),
    CHECK ((state IN ('PENDING','PROCESSING') AND completed_at IS NULL)
        OR (state IN ('ACCEPTED','FAILED','UNCERTAIN','SUPPRESSED') AND completed_at IS NOT NULL)),
    CHECK (state <> 'PENDING' OR (diagnostic IN ('NONE','OPERATOR_RELEASED') AND category IS NULL AND http_status IS NULL)),
    CHECK (state <> 'PROCESSING' OR (diagnostic = 'NONE' AND category IS NULL AND http_status IS NULL)),
    CHECK (state <> 'ACCEPTED' OR diagnostic IN ('ACCEPTED','OPERATOR_CONFIRMED')),
    CHECK (state <> 'UNCERTAIN' OR (category IS NOT NULL AND category = 'UNCERTAIN')),
    CHECK (state <> 'FAILED' OR (category IS NOT NULL AND category IN ('CONFIGURATION','PERMANENT','TRANSIENT'))),
    CHECK (state <> 'SUPPRESSED' OR diagnostic = 'INELIGIBLE_RECIPIENT')
);
CREATE INDEX ix_notification_email_pending ON occurrence_notification_email_deliveries(created_at, id)
    WHERE state = 'PENDING';
CREATE INDEX ix_notification_email_leases ON occurrence_notification_email_deliveries(lease_until, id)
    WHERE state = 'PROCESSING';

CREATE TABLE notification_email_operator_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES occurrence_notification_email_deliveries(id),
    occurred_at TIMESTAMPTZ NOT NULL,
    previous_version BIGINT NOT NULL,
    previous_state VARCHAR(16) NOT NULL CHECK (previous_state IN ('FAILED','UNCERTAIN')),
    action VARCHAR(16) NOT NULL CHECK (action IN ('RELEASE','CONFIRM')),
    reason VARCHAR(32) NOT NULL CHECK (reason IN ('CONFIGURATION_FIXED','PROVIDER_RECONCILED','DUPLICATE_RISK_ACKNOWLEDGED')),
    UNIQUE(delivery_id, previous_version),
    CHECK ((previous_state = 'FAILED' AND action = 'RELEASE' AND reason = 'CONFIGURATION_FIXED')
        OR (previous_state = 'UNCERTAIN' AND action = 'RELEASE' AND reason = 'DUPLICATE_RISK_ACKNOWLEDGED')
        OR (previous_state = 'UNCERTAIN' AND action = 'CONFIRM' AND reason = 'PROVIDER_RECONCILED'))
);

CREATE FUNCTION capture_notification_email_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO occurrence_notification_email_deliveries(notification_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$;
CREATE TRIGGER notification_capture_email_delivery AFTER INSERT ON occurrence_notifications
    FOR EACH ROW EXECUTE FUNCTION capture_notification_email_delivery();
