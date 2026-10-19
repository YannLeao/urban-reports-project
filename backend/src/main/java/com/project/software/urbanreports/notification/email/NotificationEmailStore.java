package com.project.software.urbanreports.notification.email;

import com.project.software.urbanreports.email.EmailSendException.Category;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Repository
public class NotificationEmailStore {
    public enum State { PENDING, PROCESSING, ACCEPTED, FAILED, UNCERTAIN, SUPPRESSED }
    public enum Diagnostic { NONE, ACCEPTED, LEASE_EXPIRED, INELIGIBLE_RECIPIENT, TRANSPORT_FAILURE, UNEXPECTED_FAILURE }
    public record Claim(UUID id, UUID token, UUID sendId) {}
    public record Recipient(UUID occurrenceId, String email, boolean eligible) {
        @Override public String toString() { return "Recipient[redacted]"; }
    }
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    public NotificationEmailStore(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        tx = new TransactionTemplate(manager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public Optional<Claim> reserve(Instant now, long leaseMs, UUID sendId) {
        return tx.execute(status -> {
            var token = UUID.randomUUID();
            var rows = jdbc.query("""
                WITH candidate AS (
                    SELECT id FROM occurrence_notification_email_deliveries WHERE state = 'PENDING'
                    ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
                )
                UPDATE occurrence_notification_email_deliveries d
                SET state = 'PROCESSING', updated_at = ?, version = version + 1,
                    reservation_attempts = reservation_attempts + 1, reserved_at = ?, lease_until = ?,
                    owner_token = ?, send_id = ?, diagnostic = 'NONE', category = NULL, http_status = NULL
                FROM candidate c WHERE d.id = c.id RETURNING d.id
                """, (rs, row) -> new Claim(rs.getObject(1, UUID.class), token, sendId),
                    Timestamp.from(now), Timestamp.from(now), Timestamp.from(now.plusMillis(leaseMs)), token, sendId);
            return rows.stream().findFirst();
        });
    }

    /** One committed statement; no account lock and no session requirement. */
    public Optional<Recipient> recipient(Claim claim, Instant now) {
        return tx.execute(status -> jdbc.query("""
            SELECT n.occurrence_id, a.email, (a.role = 'USER' AND a.status = 'ACTIVE') AS eligible
            FROM occurrence_notification_email_deliveries d
            JOIN occurrence_notifications n ON n.id = d.notification_id
            LEFT JOIN user_accounts a ON a.id = n.recipient_id
            WHERE d.id = ? AND d.owner_token = ? AND d.state = 'PROCESSING' AND d.lease_until > ?
            """, (rs, row) -> new Recipient(rs.getObject(1, UUID.class), rs.getString(2), rs.getBoolean(3)),
                claim.id(), claim.token(), Timestamp.from(now)).stream().findFirst());
    }

    public boolean complete(Claim claim, State state, Diagnostic diagnostic, Category category, int httpStatus, Instant now) {
        if (!Set.of(State.ACCEPTED, State.FAILED, State.UNCERTAIN, State.SUPPRESSED).contains(state))
            throw new IllegalArgumentException("Invalid terminal state");
        return Boolean.TRUE.equals(tx.execute(status -> jdbc.update("""
            UPDATE occurrence_notification_email_deliveries
            SET state = ?, diagnostic = ?, category = ?, http_status = ?, updated_at = ?, completed_at = ?,
                owner_token = NULL, reserved_at = NULL, lease_until = NULL, version = version + 1
            WHERE id = ? AND owner_token = ? AND state = 'PROCESSING' AND lease_until > ?
            """, state.name(), diagnostic.name(), category == null ? null : category.name(),
                httpStatus >= 100 && httpStatus <= 599 ? httpStatus : null,
                Timestamp.from(now), Timestamp.from(now), claim.id(), claim.token(), Timestamp.from(now)) == 1));
    }

    public int expire(Instant now, int limit) {
        return Objects.requireNonNull(tx.execute(status -> jdbc.update("""
            WITH expired AS (
                SELECT id FROM occurrence_notification_email_deliveries
                WHERE state = 'PROCESSING' AND lease_until <= ?
                ORDER BY lease_until, id LIMIT ? FOR UPDATE SKIP LOCKED
            )
            UPDATE occurrence_notification_email_deliveries d
            SET state = 'UNCERTAIN', diagnostic = 'LEASE_EXPIRED', category = 'UNCERTAIN',
                updated_at = ?, completed_at = ?, owner_token = NULL, reserved_at = NULL,
                lease_until = NULL, version = version + 1
            FROM expired e WHERE d.id = e.id
            """, Timestamp.from(now), limit, Timestamp.from(now), Timestamp.from(now))));
    }
}
