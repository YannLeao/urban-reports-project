package com.project.software.urbanreports.notification.email;

import java.io.PrintStream;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Private operator surface. No Spring application context, HTTP, Flyway or sender. */
public final class NotificationEmailOperations {
    public enum Action { RELEASE, CONFIRM }
    public enum Reason { CONFIGURATION_FIXED, PROVIDER_RECONCILED, DUPLICATE_RISK_ACKNOWLEDGED }
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final Clock clock;

    public NotificationEmailOperations(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc; this.clock = clock;
        this.tx = new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource())));
        this.tx.setTimeout(10);
    }

    public void counts(PrintStream out) {
        var counts = new EnumMap<NotificationEmailStore.State, Long>(NotificationEmailStore.State.class);
        for (var state : NotificationEmailStore.State.values()) counts.put(state, 0L);
        jdbc.query("SELECT state, count(*) FROM occurrence_notification_email_deliveries GROUP BY state", rs -> {
            counts.put(NotificationEmailStore.State.valueOf(rs.getString(1)), rs.getLong(2));
        });
        counts.forEach((state, count) -> out.println(state + " " + count));
    }

    public void list(NotificationEmailStore.State state, int offset, int size, PrintStream out) {
        if (offset < 0 || offset > 1000000 || size < 1 || size > 100) throw new IllegalArgumentException();
        out.println("delivery_id state version reservation_attempts created_at updated_at reserved_at lease_until completed_at diagnostic category http_status send_id");
        jdbc.query("""
            SELECT id, state, version, reservation_attempts, created_at, updated_at, reserved_at, lease_until,
                completed_at, diagnostic, category, http_status, send_id
            FROM occurrence_notification_email_deliveries WHERE (CAST(? AS varchar) IS NULL OR state = ?)
            ORDER BY created_at, id LIMIT ? OFFSET ?
            """, (org.springframework.jdbc.core.RowCallbackHandler) rs -> {
                var values = new ArrayList<String>();
                for (int i = 1; i <= 13; i++) values.add(Objects.toString(rs.getObject(i), "-"));
                out.println(String.join(" | ", values));
            }, state == null ? null : state.name(), state == null ? null : state.name(), size, offset);
    }

    public boolean reconcile(UUID id, NotificationEmailStore.State expected, long version, Action action, Reason reason,
            boolean previousStopped, boolean duplicateRisk) {
        validateReconciliation(expected, version, action, reason, previousStopped, duplicateRisk);
        return Boolean.TRUE.equals(tx.execute(status -> {
            var now = Timestamp.from(clock.instant());
            String next = action == Action.CONFIRM ? "ACCEPTED" : "PENDING";
            String diagnostic = action == Action.CONFIRM ? "OPERATOR_CONFIRMED" : "OPERATOR_RELEASED";
            int changed = jdbc.update("""
                UPDATE occurrence_notification_email_deliveries
                SET state = ?, diagnostic = ?, category = NULL, http_status = NULL, updated_at = ?,
                    completed_at = ?, version = version + 1
                WHERE id = ? AND state = ? AND version = ? AND owner_token IS NULL
                """, next, diagnostic, now, action == Action.CONFIRM ? now : null, id, expected.name(), version);
            if (changed != 1) return false;
            jdbc.update("""
                INSERT INTO notification_email_operator_actions(delivery_id, occurred_at, previous_version, previous_state, action, reason)
                VALUES (?, ?, ?, ?, ?, ?)
                """, id, now, version, expected.name(), action.name(), reason.name());
            return true;
        }));
    }

    static void validateReconciliation(NotificationEmailStore.State expected, long version, Action action, Reason reason,
            boolean previousStopped, boolean duplicateRisk) {
        if (version < 0 || !(expected == NotificationEmailStore.State.FAILED && action == Action.RELEASE
                    && reason == Reason.CONFIGURATION_FIXED
                || expected == NotificationEmailStore.State.UNCERTAIN && previousStopped
                    && (action == Action.CONFIRM && reason == Reason.PROVIDER_RECONCILED
                        || action == Action.RELEASE && duplicateRisk && reason == Reason.DUPLICATE_RISK_ACKNOWLEDGED)))
            throw new IllegalArgumentException("Action not permitted");
    }
}
