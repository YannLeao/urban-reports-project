package com.project.software.urbanreports.notification.email;

import com.project.software.urbanreports.email.*;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.io.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.project.software.urbanreports.notification.email.NotificationEmailStore.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint=", "image.recovery.enabled=false"})
@Import(TestcontainersConfiguration.class)
class NotificationEmailIntegrationTests {
    static final Instant NOW = Instant.parse("2026-10-19T12:00:00Z");
    @Autowired JdbcTemplate jdbc;
    @Autowired NotificationEmailStore store;
    @Autowired PlatformTransactionManager manager;
    @Autowired org.flywaydb.core.Flyway flyway;
    @MockitoBean Clock clock;
    NotificationEmailDiagnostics diagnostics;
    @BeforeEach void setup() {
        when(clock.instant()).thenReturn(NOW);
        diagnostics = new NotificationEmailDiagnostics();
        jdbc.update("DELETE FROM notification_email_operator_actions");
        jdbc.update("DELETE FROM occurrence_notification_email_deliveries");
    }
    NotificationEmailSettings settings(boolean enabled) {
        return new NotificationEmailSettings(Boolean.toString(enabled), "https://frontend.example", "60000", "3", "60000", "10000");
    }
    NotificationEmailWorker worker(TransactionalEmailSender sender) {
        return new NotificationEmailWorker(store, sender, settings(true), diagnostics, clock);
    }
    UUID fixture() {
        UUID account = UUID.randomUUID(), report = UUID.randomUUID(), event = UUID.randomUUID();
        jdbc.update("INSERT INTO user_accounts(id,name,email,password_hash,role,created_at,updated_at) VALUES (?, 'secret-person', ?, 'hash', 'USER', now(), now())", account, account + "@example.com");
        jdbc.update("INSERT INTO occurrences(id,author_id,category_id,title,neighborhood,reference,created_at) VALUES (?, ?, 1, 'secret-title', 'secret-place', 'secret-reference', now())", report, account);
        jdbc.update("INSERT INTO occurrence_history VALUES (?, ?, 'PENDING', 'REJECTED', ?, ?, 'secret-rejection-marker', 1)", event, report, account, java.sql.Timestamp.from(NOW.minusSeconds(100000)));
        return jdbc.queryForObject("SELECT id FROM occurrence_notification_email_deliveries WHERE notification_id = ?", UUID.class, event);
    }
    Map<String, Object> row(UUID id) { return jdbc.queryForMap("SELECT * FROM occurrence_notification_email_deliveries WHERE id = ?", id); }
    NotificationEmailOperations ops() { return new NotificationEmailOperations(jdbc, clock); }

    @Test void captureCommitsAtomicallyAndIncludesOldEventTimestampsWithoutBackfill() {
        UUID id = fixture();
        assertThat(row(id)).containsEntry("state", "PENDING").containsEntry("reservation_attempts", 0L);
        var tx = new TransactionTemplate(manager);
        long count = jdbc.queryForObject("SELECT count(*) FROM occurrence_notification_email_deliveries", Long.class);
        tx.executeWithoutResult(status -> { fixture(); status.setRollbackOnly(); });
        assertThat(jdbc.queryForObject("SELECT count(*) FROM occurrence_notification_email_deliveries", Long.class)).isEqualTo(count);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO occurrence_notification_email_deliveries(notification_id) SELECT notification_id FROM occurrence_notification_email_deliveries WHERE id = ?", id))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE occurrence_notification_email_deliveries SET state='PROCESSING' WHERE id = ?", id))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE occurrence_notification_email_deliveries SET state='FAILED', completed_at=now() WHERE id = ?", id))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test void upgradeDoesNotBackfillAndCaptureIsTransactionalOnInstallation() {
        String schema = "external_" + UUID.randomUUID().toString().replace("-", "");
        var source = flyway.getConfiguration().getDataSource();
        org.flywaydb.core.Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("11").load().migrate();
        UUID account = UUID.randomUUID(), report = UUID.randomUUID(), old = UUID.randomUUID();
        jdbc.update("INSERT INTO " + schema + ".user_accounts(id,name,email,password_hash,role,created_at,updated_at) VALUES (?, 'Pessoa', 'migration@example.com', 'hash', 'USER', now(), now())", account);
        jdbc.update("INSERT INTO " + schema + ".occurrences(id,author_id,category_id,title,neighborhood,reference,image_key,created_at) VALUES (?, ?, 1, 'Poste', 'Centro', 'Praça', 'test.png', now())", report, account);
        new TransactionTemplate(manager).executeWithoutResult(tx -> {
            jdbc.execute("SET LOCAL search_path TO " + schema);
            jdbc.update("INSERT INTO occurrence_history VALUES (?, ?, 'PENDING', 'IN_ANALYSIS', ?, '2020-01-01', NULL, 1)", old, report, account);
        });
        var upgrade = org.flywaydb.core.Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).load();
        assertThat(upgrade.migrate().migrationsExecuted).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".occurrence_notification_email_deliveries", Integer.class)).isZero();
        new TransactionTemplate(manager).executeWithoutResult(tx -> {
            jdbc.execute("SET LOCAL search_path TO " + schema);
            jdbc.update("INSERT INTO occurrence_history VALUES (?, ?, 'IN_ANALYSIS', 'RESOLVED', ?, '2020-01-02', NULL, 2)", UUID.randomUUID(), report, account);
        });
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".occurrence_notification_email_deliveries", Integer.class)).isEqualTo(1);
        assertThat(upgrade.migrate().migrationsExecuted).isZero();
    }

    @Test void disabledAccumulatesAndAcceptedIsNeverResentAndContainsOnlyPrivateLink() {
        UUID id = fixture(); var calls = new AtomicInteger();
        TransactionalEmailSender sender = message -> {
            calls.incrementAndGet();
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(TransactionSynchronizationManager.getResourceMap()).isEmpty();
            assertThat(message.subject()).isEqualTo("Atualização do seu relato — Alô Cidade");
            assertThat(message.text()).contains("https://frontend.example/meus-relatos/")
                    .doesNotContain("secret-", "token=", "@", "image", "REJECTED");
            String current = jdbc.queryForObject("SELECT a.email FROM occurrence_notification_email_deliveries d JOIN occurrence_notifications n ON n.id=d.notification_id JOIN user_accounts a ON a.id=n.recipient_id WHERE d.id=?", String.class, id);
            assertThat(message.recipient()).isEqualTo(current);
            // Another connection can lock the delivery and account while network I/O runs.
            new TransactionTemplate(manager).executeWithoutResult(tx -> {
                jdbc.queryForObject("SELECT id FROM occurrence_notification_email_deliveries WHERE id=? FOR UPDATE NOWAIT", UUID.class, id);
            });
            return new EmailSendResult("private-provider-id");
        };
        new NotificationEmailWorker(store, sender, settings(false), diagnostics, clock).poll();
        assertThat(calls.get()).isZero();
        jdbc.update("UPDATE user_accounts SET email='current-address@example.com' WHERE id=(SELECT n.recipient_id FROM occurrence_notification_email_deliveries d JOIN occurrence_notifications n ON n.id=d.notification_id WHERE d.id=?)", id);
        var worker = worker(sender); worker.poll(); worker.poll();
        assertThat(row(id)).containsEntry("state", "ACCEPTED").containsEntry("reservation_attempts", 1L);
        assertThat(calls.get()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT n.read_at FROM occurrence_notification_email_deliveries d JOIN occurrence_notifications n ON n.id=d.notification_id WHERE d.id=?", Object.class, id)).isNull();
    }

    @ParameterizedTest @EnumSource(EmailSendException.Category.class)
    void allTransportFailuresStopUntilExplicitRecovery(EmailSendException.Category category) {
        UUID id = fixture(); var calls = new AtomicInteger();
        var worker = worker(message -> { calls.incrementAndGet(); throw new EmailSendException(category, category == EmailSendException.Category.TRANSIENT ? 503 : 0); });
        worker.poll(); worker.poll();
        assertThat(row(id)).containsEntry("state", category == EmailSendException.Category.UNCERTAIN ? "UNCERTAIN" : "FAILED")
                .containsEntry("category", category.name()).containsEntry("reservation_attempts", 1L);
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test void independentWorkersReserveOnceAndExpiredLeaseNeverResendsOrAcceptsLateCompletion() throws Exception {
        UUID id = fixture(); var entered = new CountDownLatch(1); var release = new CountDownLatch(1); var calls = new AtomicInteger();
        TransactionalEmailSender sender = message -> {
            calls.incrementAndGet(); entered.countDown();
            try { assertThat(release.await(10, TimeUnit.SECONDS)).isTrue(); }
            catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new EmailSendException(EmailSendException.Category.UNCERTAIN, 0); }
            return new EmailSendResult("private-id");
        };
        try (var executor = Executors.newSingleThreadExecutor()) {
            var first = executor.submit(() -> worker(sender).poll());
            try {
                assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
                worker(sender).poll(); assertThat(calls.get()).isEqualTo(1);
                when(clock.instant()).thenReturn(NOW.plusSeconds(61));
                worker(sender).poll();
                assertThat(row(id)).containsEntry("state", "UNCERTAIN").containsEntry("diagnostic", "LEASE_EXPIRED");
                assertThat(calls.get()).isEqualTo(1);
            } finally { release.countDown(); }
            first.get(10, TimeUnit.SECONDS);
        }
        assertThat(row(id)).containsEntry("state", "UNCERTAIN");
    }

    @Test void restartAfterReservationRequiresReconciliationAndVersionProtectsNewAttempt() {
        UUID id = fixture(); var abandoned = store.reserve(NOW, 60000, UUID.randomUUID()).orElseThrow();
        when(clock.instant()).thenReturn(NOW.plusSeconds(61));
        var sender = mock(TransactionalEmailSender.class); worker(sender).poll();
        verify(sender).validateConfiguration(); verify(sender, never()).send(any(), any());
        assertThat(row(id)).containsEntry("state", "UNCERTAIN");
        long version = (long) row(id).get("version");
        assertThatThrownBy(() -> ops().reconcile(id, State.UNCERTAIN, version, NotificationEmailOperations.Action.RELEASE,
                NotificationEmailOperations.Reason.DUPLICATE_RISK_ACKNOWLEDGED, false, true)).isInstanceOf(IllegalArgumentException.class);
        assertThat(ops().reconcile(id, State.UNCERTAIN, version, NotificationEmailOperations.Action.RELEASE,
                NotificationEmailOperations.Reason.DUPLICATE_RISK_ACKNOWLEDGED, true, true)).isTrue();
        assertThat(store.complete(abandoned, State.ACCEPTED, Diagnostic.ACCEPTED, null, 201, NOW.plusSeconds(61))).isFalse();
        assertThat(ops().reconcile(id, State.UNCERTAIN, version, NotificationEmailOperations.Action.CONFIRM,
                NotificationEmailOperations.Reason.PROVIDER_RECONCILED, true, false)).isFalse();
        var next = store.reserve(NOW.plusSeconds(61), 60000, UUID.randomUUID()).orElseThrow();
        assertThat(next.sendId()).isNotEqualTo(abandoned.sendId());
        assertThat(row(id)).containsEntry("reservation_attempts", 2L);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_email_operator_actions WHERE delivery_id=?", Integer.class, id)).isEqualTo(1);
    }

    @Test void suppressionAndGlobalPreflightDoNotExposeOrSendPrivateDetails() {
        UUID id = fixture(); var sender = mock(TransactionalEmailSender.class);
        doThrow(new EmailSendException(EmailSendException.Category.CONFIGURATION, 0)).when(sender).validateConfiguration();
        worker(sender).poll(); worker(sender).poll();
        assertThat(row(id)).containsEntry("state", "PENDING").containsEntry("reservation_attempts", 0L);
        verify(sender, never()).send(any()); reset(sender);
        jdbc.update("UPDATE user_accounts SET role='ADMIN', status='DISABLED' WHERE id=(SELECT n.recipient_id FROM occurrence_notification_email_deliveries d JOIN occurrence_notifications n ON n.id=d.notification_id WHERE d.id=?)", id);
        worker(sender).poll();
        assertThat(row(id)).containsEntry("state", "SUPPRESSED").containsEntry("diagnostic", "INELIGIBLE_RECIPIENT");
        verify(sender, never()).send(any(), any());
    }

    @Test void databaseResultFailureLeavesReservationWithoutSecondPostAndLogsNoFalsePersistence() {
        UUID id = fixture(); var broken = spy(new NotificationEmailStore(jdbc, manager)); var calls = new AtomicInteger();
        doThrow(new IllegalStateException("secret-db-cause")).when(broken).complete(any(), any(), any(), any(), anyInt(), any());
        var worker = new NotificationEmailWorker(broken, message -> { calls.incrementAndGet(); return new EmailSendResult("secret-id"); }, settings(true), diagnostics, clock);
        worker.poll(); worker.poll();
        assertThat(calls.get()).isEqualTo(1); assertThat(row(id)).containsEntry("state", "PROCESSING");
        when(clock.instant()).thenReturn(NOW.plusSeconds(61)); worker.poll();
        assertThat(row(id)).containsEntry("state", "UNCERTAIN"); assertThat(calls.get()).isEqualTo(1);
    }

    @Test void operatorReadOnlyOutputAndConditionalReleasesAreRestrictedAndSanitized() {
        UUID id = fixture(); worker(message -> { throw new EmailSendException(EmailSendException.Category.TRANSIENT, 429); }).poll();
        var output = new ByteArrayOutputStream(); var out = new PrintStream(output);
        assertThat(NotificationEmailCommand.execute(new String[]{"counts"}, this::ops, out)).isZero();
        assertThat(NotificationEmailCommand.execute(new String[]{"list", "--state=FAILED", "--size=1"}, this::ops, out)).isZero();
        assertThat(output.toString()).contains(id.toString(), "FAILED", "TRANSIENT", "429").doesNotContain("secret-", "@", "https://");
        long version = (long) row(id).get("version");
        assertThat(ops().reconcile(id, State.FAILED, version, NotificationEmailOperations.Action.RELEASE,
                NotificationEmailOperations.Reason.CONFIGURATION_FIXED, false, false)).isTrue();
        assertThat(ops().reconcile(id, State.FAILED, version, NotificationEmailOperations.Action.RELEASE,
                NotificationEmailOperations.Reason.CONFIGURATION_FIXED, false, false)).isFalse();
        for (var forbidden : List.of(State.PENDING, State.PROCESSING, State.ACCEPTED, State.SUPPRESSED))
            assertThatThrownBy(() -> ops().reconcile(id, forbidden, version, NotificationEmailOperations.Action.RELEASE,
                    NotificationEmailOperations.Reason.CONFIGURATION_FIXED, true, true)).isInstanceOf(IllegalArgumentException.class);
        assertThat(NotificationEmailCommand.run(new String[]{"counts"}, Map.of(), out)).isEqualTo(2);
        assertThat(NotificationEmailCommand.execute(new String[]{"list", "--size=101"}, () -> { throw new AssertionError("must validate before connection"); }, out)).isEqualTo(2);
    }

    @Test void uncommittedCaptureCannotBeReservedAndFailedItemDoesNotBlockFollowingItem() throws Exception {
        var inserted = new CountDownLatch(1); var commit = new CountDownLatch(1);
        var calls = new AtomicInteger();
        var worker = worker(message -> {
            if (calls.incrementAndGet() == 1) throw new EmailSendException(EmailSendException.Category.PERMANENT, 403);
            return new EmailSendResult("private-id");
        });
        try (var executor = Executors.newSingleThreadExecutor()) {
            var pending = executor.submit(() -> new TransactionTemplate(manager).execute(tx -> {
                UUID id = fixture(); inserted.countDown();
                try { assertThat(commit.await(10, TimeUnit.SECONDS)).isTrue(); }
                catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(); }
                return id;
            }));
            try {
                assertThat(inserted.await(10, TimeUnit.SECONDS)).isTrue(); worker.poll(); assertThat(calls.get()).isZero();
            } finally { commit.countDown(); }
            UUID first = pending.get(10, TimeUnit.SECONDS);
            UUID second = fixture(); worker.poll();
            assertThat(calls.get()).isEqualTo(2);
            assertThat(List.of(row(first).get("state"), row(second).get("state"))).containsExactlyInAnyOrder("FAILED", "ACCEPTED");
        }
    }

    @Test void privateReadOnlyCredentialsCanInspectButCannotReconcileAndAuditFailureRollsBack() throws Exception {
        UUID id = fixture(); worker(message -> { throw new EmailSendException(EmailSendException.Category.TRANSIENT, 429); }).poll();
        String username = "notification_reader_" + UUID.randomUUID().toString().replace("-", "");
        jdbc.execute("CREATE ROLE " + username + " LOGIN PASSWORD 'synthetic-local-password'");
        jdbc.execute("GRANT USAGE ON SCHEMA public TO " + username);
        jdbc.execute("GRANT SELECT ON occurrence_notification_email_deliveries TO " + username);
        String url;
        try (var connection = Objects.requireNonNull(jdbc.getDataSource()).getConnection()) { url = connection.getMetaData().getURL(); }
        var environment = Map.of("NOTIFICATION_OPS_DB_URL", url, "NOTIFICATION_OPS_DB_USERNAME", username,
                "NOTIFICATION_OPS_DB_PASSWORD", "synthetic-local-password");
        var output = new ByteArrayOutputStream(); var out = new PrintStream(output);
        assertThat(NotificationEmailCommand.run(new String[]{"counts"}, environment, out)).isZero();
        assertThat(NotificationEmailCommand.run(new String[]{"list"}, environment, out)).isZero();
        long version = (long) row(id).get("version");
        String[] args = {"reconcile", "--id=" + id, "--state=FAILED", "--version=" + version, "--action=RELEASE", "--reason=CONFIGURATION_FIXED"};
        assertThat(NotificationEmailCommand.run(args, environment, out)).isEqualTo(4);
        assertThat(row(id)).containsEntry("state", "FAILED").containsEntry("version", version);
        // UPDATE permission without audit INSERT must still leave the original state intact.
        jdbc.execute("GRANT UPDATE ON occurrence_notification_email_deliveries TO " + username);
        assertThat(NotificationEmailCommand.run(args, environment, out)).isEqualTo(4);
        assertThat(row(id)).containsEntry("state", "FAILED").containsEntry("version", version);
        jdbc.execute("GRANT INSERT ON notification_email_operator_actions TO " + username);
        assertThat(NotificationEmailCommand.run(args, environment, out)).isZero();
        assertThat(NotificationEmailCommand.run(args, environment, out)).isEqualTo(3);
        assertThat(output.toString()).contains("UPDATED 1", "CONFLICT 0").doesNotContain("synthetic-local-password", username, url, "secret-");
    }

    @Test void uncertainConfirmationIsTerminalAndConcurrentOperatorActionsModifyExactlyOnce() throws Exception {
        UUID id = fixture(); worker(message -> { throw new EmailSendException(EmailSendException.Category.UNCERTAIN, 0); }).poll();
        long version = (long) row(id).get("version");
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> confirm = () -> {
                gate.await(); return ops().reconcile(id, State.UNCERTAIN, version, NotificationEmailOperations.Action.CONFIRM,
                        NotificationEmailOperations.Reason.PROVIDER_RECONCILED, true, false);
            };
            var one = executor.submit(confirm); var two = executor.submit(confirm); gate.countDown();
            assertThat(List.of(one.get(10, TimeUnit.SECONDS), two.get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        assertThat(row(id)).containsEntry("state", "ACCEPTED").containsEntry("diagnostic", "OPERATOR_CONFIRMED");
        var sender = mock(TransactionalEmailSender.class); worker(sender).poll(); verify(sender, never()).send(any(), any());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_email_operator_actions WHERE delivery_id=?", Integer.class, id)).isEqualTo(1);
    }
}
