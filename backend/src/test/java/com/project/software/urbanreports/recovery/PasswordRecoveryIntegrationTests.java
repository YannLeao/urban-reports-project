package com.project.software.urbanreports.recovery;

import com.project.software.urbanreports.auth.LoginService;
import com.project.software.urbanreports.identity.*;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint=", "admin.frontend-origin=http://localhost:5173"})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PasswordRecoveryIntegrationTests {
    static final String PASSWORD = "synthetic strong password phrase";
    static final String NEW_PASSWORD = "another synthetic password phrase";
    static final String THIRD_PASSWORD = "third synthetic password phrase";
    static final Instant NOW = Instant.parse("2026-10-15T12:00:00Z");
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserAccountRepository accounts;
    @Autowired RegistrationService registration;
    @Autowired LoginService login;
    @Autowired PasswordRecoveryService service;
    @Autowired PlatformTransactionManager manager;
    @MockitoBean PasswordRecoveryMailSender mail;
    @MockitoBean Clock clock;
    @MockitoSpyBean PasswordEncoder encoder;
    static final java.util.concurrent.atomic.AtomicInteger PEER = new java.util.concurrent.atomic.AtomicInteger();
    String trafficOrigin;
    final Map<String, String> links = new ConcurrentHashMap<>();

    @BeforeEach void setup() {
        when(clock.instant()).thenReturn(NOW); when(clock.getZone()).thenReturn(ZoneOffset.UTC);
        trafficOrigin = "192.0.2." + PEER.incrementAndGet();
        links.clear();
        doAnswer(call -> { links.put(call.getArgument(0), call.getArgument(1)); return null; })
                .when(mail).send(anyString(), anyString(), any());
    }

    @Test void requestIsGenericAndOnlyEligibleAccountsGetMail() throws Exception {
        var citizen = citizen(); var admin = activeAdmin(); var pending = pendingAdmin(); var disabled = disabledAdmin();
        String unknown = UUID.randomUUID() + "@example.com";
        String known = askRecovery(" " + citizen.email().toUpperCase(Locale.ROOT) + " ");
        assertThat(askRecovery(unknown)).isEqualTo(known);
        assertThat(askRecovery(admin.getEmail())).isEqualTo(known);
        assertThat(askRecovery(pending.getEmail())).isEqualTo(known);
        assertThat(askRecovery(disabled.getEmail())).isEqualTo(known);
        assertThat(link(citizen.email())).matches("http://localhost:5173/redefinir-senha#token=[A-Za-z0-9_-]{43}");
        link(admin.getEmail());
        verify(mail, after(500).times(2)).send(anyString(), anyString(), any());
        assertThat(activeTokens(citizen.id())).isEqualTo(1);
        assertThat(activeTokens(pending.getId())).isZero();
        assertThat(activeTokens(disabled.getId())).isZero();
    }

    @Test void tokenIsPersistedOnlyAsHashWithThirtyMinuteLifetime() throws Exception {
        var user = citizen(); askRecovery(user.email()); String raw = token(user.email());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM password_recovery_tokens WHERE token_hash = ?", Integer.class, raw)).isZero();
        assertThat(jdbc.queryForObject("SELECT length(token_hash) FROM password_recovery_tokens WHERE account_id = ?", Integer.class, user.id())).isEqualTo(64);
        assertThat(jdbc.queryForObject("SELECT extract(epoch FROM (expires_at - created_at))::int FROM password_recovery_tokens WHERE account_id = ?", Integer.class, user.id())).isEqualTo(1800);
    }

    @Test void providerFailureDoesNotChangeTheResponseOrDiscardTheToken() throws Exception {
        var user = citizen();
        doThrow(new IllegalStateException("Provider unavailable")).when(mail).send(anyString(), anyString(), any());
        askRecovery(user.email());
        verify(mail, timeout(5000)).send(eq(user.email()), anyString(), any());
        assertThat(activeTokens(user.id())).isEqualTo(1);
    }

    @Test void resetChangesPasswordOnceRevokesAllSessionsAndDoesNotLogIn() throws Exception {
        var user = citizen();
        String oldA = login.login(user.email(), PASSWORD).accessToken(), oldB = login.login(user.email(), PASSWORD).accessToken();
        me(oldA).andExpect(status().isOk());
        askRecovery(user.email()); String raw = token(user.email());
        redeem(raw, NEW_PASSWORD).andExpect(status().isOk()).andExpect(jsonPath("$.reset").value(true))
                .andExpect(jsonPath("$.accessToken").doesNotExist()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().doesNotExist("Set-Cookie"));
        me(oldA).andExpect(status().isUnauthorized()); me(oldB).andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> login.login(user.email(), PASSWORD)).isInstanceOf(BadCredentialsException.class);
        assertThat(login.login(user.email(), NEW_PASSWORD).user().id()).isEqualTo(user.id());
        redeem(raw, THIRD_PASSWORD).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_RECOVERY_LINK"));
        assertThatThrownBy(() -> login.login(user.email(), THIRD_PASSWORD)).isInstanceOf(BadCredentialsException.class);
    }

    @Test void expiryIsExclusiveAtThirtyMinutes() throws Exception {
        var user = citizen(); askRecovery(user.email()); String raw = token(user.email());
        when(clock.instant()).thenReturn(NOW.plusSeconds(1800));
        redeem(raw, NEW_PASSWORD).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_RECOVERY_LINK"));
        when(clock.instant()).thenReturn(NOW.plusSeconds(1799));
        redeem(raw, NEW_PASSWORD).andExpect(status().isOk());
        assertThat(login.login(user.email(), NEW_PASSWORD).user().id()).isEqualTo(user.id());
    }

    @Test void newRequestInvalidatesTheActiveToken() throws Exception {
        var user = citizen(); askRecovery(user.email()); String first = token(user.email());
        links.remove(user.email());
        when(clock.instant()).thenReturn(NOW.plusSeconds(60));
        askRecovery(user.email()); String second = token(user.email());
        assertThat(second).isNotEqualTo(first);
        assertThat(activeTokens(user.id())).isEqualTo(1);
        redeem(first, NEW_PASSWORD).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_RECOVERY_LINK"));
        redeem(second, NEW_PASSWORD).andExpect(status().isOk());
    }

    @Test void weakPasswordIsRejectedWithoutConsumingTheToken() throws Exception {
        var user = citizen(); askRecovery(user.email()); String raw = token(user.email());
        redeem(raw, "weak").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PASSWORD"));
        assertThat(activeTokens(user.id())).isEqualTo(1);
        redeem(raw, NEW_PASSWORD).andExpect(status().isOk());
    }

    @Test void malformedInputsAreRejectedUniformly() throws Exception {
        for (String token : List.of("", "not-a-token", "A".repeat(43)))
            redeem(token, PASSWORD).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_RECOVERY_LINK"));
        mvc.perform(post("/api/auth/password-resets").with(r -> { r.setRemoteAddr(trafficOrigin); return r; }).contentType("application/json").content(mapper.writeValueAsString(Map.of("password", PASSWORD))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_RECOVERY_LINK"));
        mvc.perform(post("/api/auth/password-recovery-requests").with(r -> { r.setRemoteAddr(trafficOrigin); return r; }).contentType("application/json").content("{\"email\":\"invalid\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_EMAIL"));
        mvc.perform(post("/api/auth/password-recovery-requests").with(r -> { r.setRemoteAddr(trafficOrigin); return r; }).contentType("application/json").content("{\"email\":\"a@example.com\",\"role\":\"ADMIN\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mvc.perform(post("/api/auth/password-recovery-requests").with(r -> { r.setRemoteAddr(trafficOrigin); return r; }).contentType("text/plain").content("{}")).andExpect(status().isUnsupportedMediaType());
    }

    @Test void accountDisabledAfterRequestCannotRedeemAndIsNotReactivated() throws Exception {
        var admin = activeAdmin(); askRecovery(admin.getEmail()); String raw = token(admin.getEmail());
        new TransactionTemplate(manager).executeWithoutResult(status -> accounts.lockById(admin.getId()).orElseThrow().disableAdmin(NOW));
        redeem(raw, NEW_PASSWORD).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_RECOVERY_LINK"));
        var after = accounts.findById(admin.getId()).orElseThrow();
        assertThat(after.getStatus()).isEqualTo(AccountStatus.DISABLED);
        assertThat(after.getPasswordHash()).isEqualTo(admin.getPasswordHash());
    }

    @Test void concurrentResetsConsumeTheTokenExactlyOnce() throws Exception {
        var user = citizen(); askRecovery(user.email()); String raw = token(user.email());
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            List<Future<String>> attempts = new ArrayList<>();
            for (String candidate : List.of(NEW_PASSWORD, THIRD_PASSWORD)) attempts.add(executor.submit(() -> {
                gate.await();
                try { service.reset(raw, candidate); return candidate; }
                catch (PasswordRecoveryException invalid) { return null; }
            }));
            gate.countDown();
            var winners = new ArrayList<String>();
            for (var attempt : attempts) { String result = attempt.get(20, TimeUnit.SECONDS); if (result != null) winners.add(result); }
            assertThat(winners).hasSize(1);
            String winner = winners.get(0), loser = winner.equals(NEW_PASSWORD) ? THIRD_PASSWORD : NEW_PASSWORD;
            assertThat(login.login(user.email(), winner).user().id()).isEqualTo(user.id());
            assertThatThrownBy(() -> login.login(user.email(), loser)).isInstanceOf(BadCredentialsException.class);
        }
    }

    @Test void resetBetweenPasswordCheckAndAccountLockPreventsTheOldCredential() throws Exception {
        var user = citizen(); askRecovery(user.email()); String raw = token(user.email());
        var checked = new CountDownLatch(1); var resume = new CountDownLatch(1);
        var thread = new AtomicReference<Thread>();
        doAnswer(invocation -> {
            boolean matched = (boolean) invocation.callRealMethod();
            if (Thread.currentThread() == thread.get()) { checked.countDown(); assertThat(resume.await(10, TimeUnit.SECONDS)).isTrue(); }
            return matched;
        }).when(encoder).matches(eq(PASSWORD), anyString());
        try (var executor = Executors.newSingleThreadExecutor()) {
            var attempt = executor.submit(() -> { thread.set(Thread.currentThread()); return login.login(user.email(), PASSWORD); });
            try {
                assertThat(checked.await(10, TimeUnit.SECONDS)).isTrue();
                service.reset(raw, NEW_PASSWORD);
            } finally { resume.countDown(); }
            assertThatThrownBy(() -> attempt.get(10, TimeUnit.SECONDS)).hasCauseInstanceOf(BadCredentialsException.class);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM auth_sessions WHERE user_id = ?", Long.class, user.id())).isZero();
    }

    @Test void failedCommitRollsBackPasswordTokenAndSessionRevocation() throws Exception {
        var user = citizen(); String session = login.login(user.email(), PASSWORD).accessToken();
        askRecovery(user.email()); String raw = token(user.email());
        jdbc.execute("CREATE FUNCTION fail_recovery_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id = '" + user.id()
                + "'::uuid THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE CONSTRAINT TRIGGER recovery_commit_failure AFTER UPDATE ON auth_sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_recovery_commit()");
        try {
            assertThatThrownBy(() -> service.reset(raw, NEW_PASSWORD)).isInstanceOf(RuntimeException.class);
            assertThat(activeTokens(user.id())).isEqualTo(1);
            me(session).andExpect(status().isOk());
            assertThat(login.login(user.email(), PASSWORD).user().id()).isEqualTo(user.id());
        } finally {
            jdbc.execute("DROP TRIGGER recovery_commit_failure ON auth_sessions");
            jdbc.execute("DROP FUNCTION fail_recovery_commit()");
        }
        service.reset(raw, NEW_PASSWORD);
        assertThat(login.login(user.email(), NEW_PASSWORD).user().id()).isEqualTo(user.id());
    }

    @Autowired RecoveryDelivery delivery;
    @Autowired PasswordRecoveryTokens recoveryTokens;
    @MockitoSpyBean(name = "passwordRecoveryExecutor") org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor executor;

    @Test void suppressedCanonicalRequestsKeepTheCurrentLinkAndOriginResetLimitIsGeneric() throws Exception {
        var user = citizen(); askRecovery(user.email()); String first = token(user.email());
        askRecovery(" " + user.email().toUpperCase(Locale.ROOT) + " ");
        assertThat(activeTokens(user.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM password_recovery_tokens WHERE account_id=?", Integer.class, user.id())).isEqualTo(1);
        verify(mail, times(1)).send(eq(user.email()), anyString(), any());
        for (int i = 0; i < 30; i++) redeem("not-a-token", NEW_PASSWORD).andExpect(status().isBadRequest());
        redeem(first, NEW_PASSWORD).andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RECOVERY_RATE_LIMITED"))
                .andExpect(header().string("Cache-Control", "no-store"));
        when(clock.instant()).thenReturn(NOW.plusSeconds(600));
        redeem(first, NEW_PASSWORD).andExpect(status().isOk());
    }

    @Test void concurrentRequestsAdmitOnlyOneAndDoNotInvalidateTheWinner() throws Exception {
        var user = citizen();
        try (var workers = Executors.newFixedThreadPool(2)) {
            var start = new CountDownLatch(1);
            var a = workers.submit(() -> { start.await(); service.request(user.email(), "concurrent-a"); return null; });
            var b = workers.submit(() -> { start.await(); service.request(user.email().toUpperCase(Locale.ROOT), "concurrent-b"); return null; });
            start.countDown(); a.get(10, TimeUnit.SECONDS); b.get(10, TimeUnit.SECONDS);
        }
        String raw = token(user.email());
        assertThat(activeTokens(user.id())).isEqualTo(1);
        verify(mail, after(100).times(1)).send(eq(user.email()), anyString(), any());
        redeem(raw, NEW_PASSWORD).andExpect(status().isOk());
    }

    @Test void requestRollbackAndDeferredCommitFailureNeverSubmitAndReleaseCapacity() throws Exception {
        var user = citizen();
        jdbc.execute("CREATE FUNCTION fail_request_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test insert rollback'; END $$");
        jdbc.execute("CREATE TRIGGER request_insert_failure BEFORE INSERT ON password_recovery_tokens FOR EACH ROW EXECUTE FUNCTION fail_request_insert()");
        try {
            assertThatThrownBy(() -> service.request(user.email(), "rollback-peer")).isInstanceOf(RuntimeException.class);
            assertThat(activeTokens(user.id())).isZero();
            verify(mail, never()).send(anyString(), anyString(), any()); assertCapacityRestored();
        } finally {
            jdbc.execute("DROP TRIGGER request_insert_failure ON password_recovery_tokens");
            jdbc.execute("DROP FUNCTION fail_request_insert()");
        }
        when(clock.instant()).thenReturn(NOW.plusSeconds(60));
        jdbc.execute("CREATE FUNCTION fail_request_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.account_id = '" + user.id()
                + "'::uuid THEN RAISE EXCEPTION 'test commit rollback'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE CONSTRAINT TRIGGER request_commit_failure AFTER INSERT ON password_recovery_tokens DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_request_commit()");
        try {
            assertThatThrownBy(() -> service.request(user.email(), "commit-peer")).isInstanceOf(RuntimeException.class);
            assertThat(activeTokens(user.id())).isZero(); verify(mail, never()).send(anyString(), anyString(), any()); assertCapacityRestored();
        } finally {
            jdbc.execute("DROP TRIGGER request_commit_failure ON password_recovery_tokens");
            jdbc.execute("DROP FUNCTION fail_request_commit()");
        }
    }

    @Test void saturationDoesNotInvalidateAndPostCommitRejectionKeepsGenericResponse() throws Exception {
        var user = citizen(); askRecovery(user.email()); String first = token(user.email());
        // Wait until the original delivery released its reservation.
        executor.getThreadPoolExecutor().submit(() -> {}).get(5, TimeUnit.SECONDS);
        var held = new ArrayList<RecoveryDelivery.Reservation>();
        try {
            for (int i = 0; i < 10; i++) { var slot = delivery.reserve(); assertThat(slot).isNotNull(); held.add(slot); }
            when(clock.instant()).thenReturn(NOW.plusSeconds(60)); askRecovery(user.email());
            assertThat(activeTokens(user.id())).isEqualTo(1);
            redeem(first, NEW_PASSWORD).andExpect(status().isOk());
        } finally { held.forEach(RecoveryDelivery.Reservation::close); }
        var another = citizen();
        doThrow(new org.springframework.core.task.TaskRejectedException("sentinel rejected"))
                .when(executor).execute(any(Runnable.class));
        askRecovery(another.email());
        assertThat(activeTokens(another.id())).isEqualTo(1);
        verify(mail, never()).send(eq(another.email()), anyString(), any());
        assertCapacityRestored();
    }

    @Test void queuedOldExpiredOrIneligibleDeliveriesAreSuppressed() throws Exception {
        var release = new CountDownLatch(1); var started = new CountDownLatch(2);
        try {
            for (int i = 0; i < 2; i++) delivery.submit(delivery.reserve(),
                    new com.project.software.urbanreports.email.EmailObservation(com.project.software.urbanreports.email.EmailObservation.Operation.PASSWORD_RECOVERY),
                    () -> { started.countDown(); try { release.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); } });
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var user = citizen(); askRecovery(user.email());
            when(clock.instant()).thenReturn(NOW.plusSeconds(60)); askRecovery(user.email());
            var admin = activeAdmin(); askRecovery(admin.getEmail());
            new TransactionTemplate(manager).executeWithoutResult(tx -> accounts.lockById(admin.getId()).orElseThrow().disableAdmin(NOW));
            var expired = citizen(); askRecovery(expired.email());
            // Expire only this queued token, preserving the real clock for the current user.
            jdbc.update("UPDATE password_recovery_tokens SET created_at=created_at - interval '31 minutes', expires_at=expires_at - interval '31 minutes' WHERE account_id=?", expired.id());
            release.countDown();
            token(user.email());
            executor.getThreadPoolExecutor().submit(() -> {}).get(5, TimeUnit.SECONDS);
            verify(mail, after(100).times(1)).send(eq(user.email()), anyString(), any());
            verify(mail, never()).send(eq(admin.getEmail()), anyString(), any());
            verify(mail, never()).send(eq(expired.email()), anyString(), any());
        } finally { release.countDown(); }
    }

    @Test void requestAndResetRaceLeaveOnlyTheNewTokenUsable() throws Exception {
        var user = citizen(); askRecovery(user.email()); String old = token(user.email()); links.remove(user.email());
        when(clock.instant()).thenReturn(NOW.plusSeconds(60));
        try (var workers = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            var request = workers.submit(() -> { gate.await(); service.request(user.email(), "race-peer"); return null; });
            var resetAttempt = workers.submit(() -> { gate.await(); try { service.reset(old, NEW_PASSWORD); } catch (PasswordRecoveryException expected) { } return null; });
            gate.countDown(); request.get(10, TimeUnit.SECONDS); resetAttempt.get(10, TimeUnit.SECONDS);
        }
        String current = token(user.email());
        redeem(old, THIRD_PASSWORD).andExpect(status().isBadRequest());
        redeem(current, THIRD_PASSWORD).andExpect(status().isOk());
    }

    @Autowired com.project.software.urbanreports.administration.AdminActivationTokens activationTokens;

    @Test void activationAndRecoveryTokensAreNotInterchangeableAndSuperAdminRemainsEligible() throws Exception {
        var pending = pendingAdmin();
        String invitation = new TransactionTemplate(manager).execute(tx -> {
            accounts.lockById(pending.getId()).orElseThrow();
            return activationTokens.replace(pending.getId(), NOW);
        });
        redeem(invitation, NEW_PASSWORD).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RECOVERY_LINK"));
        var superAdmin = accounts.saveAndFlush(UserAccount.firstSuperAdmin("Gestão teste", UUID.randomUUID() + "@example.com", encoder.encode(PASSWORD), NOW));
        askRecovery(superAdmin.getEmail()); String recovery = token(superAdmin.getEmail());
        mvc.perform(post("/api/auth/admin-activations").contentType("application/json")
                .content(mapper.writeValueAsString(Map.of("token", recovery, "password", NEW_PASSWORD))))
                .andExpect(status().isBadRequest());
        redeem(recovery, NEW_PASSWORD).andExpect(status().isOk());
        assertThat(login.login(superAdmin.getEmail(), NEW_PASSWORD).user().role()).isEqualTo(AccountRole.SUPER_ADMIN);
    }

    @Test void newRoutesHaveStrictJsonCorsAndNoStoreWithoutLogin() throws Exception {
        for (String path : List.of("/api/auth/password-recovery-requests", "/api/auth/password-resets")) {
            mvc.perform(options(path).header("Origin", "http://localhost:5173")
                    .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "Content-Type"))
                    .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"))
                    .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
            for (String body : List.of("{\"email\":42}", "{\"token\":42}", "{\"extra\":true}", " ".repeat(8193)))
                mvc.perform(post(path).contentType("application/json").content(body))
                        .andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control", "no-store"));
        }
    }

    void assertCapacityRestored() {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (executor.getActiveCount() > 0 && System.nanoTime() < deadline) {
            try { Thread.sleep(10); } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new AssertionError(e); }
        }
        var held = new ArrayList<RecoveryDelivery.Reservation>();
        try {
            for (int i = 0; i < 10; i++) { var reservation = delivery.reserve(); assertThat(reservation).isNotNull(); held.add(reservation); }
            assertThat(delivery.reserve()).isNull();
        } finally { held.forEach(RecoveryDelivery.Reservation::close); }
    }

    String askRecovery(String email) throws Exception {
        return mvc.perform(post("/api/auth/password-recovery-requests").with(r -> { r.setRemoteAddr(trafficOrigin); return r; }).contentType("application/json").content(mapper.writeValueAsString(Map.of("email", email))))
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.requested").value(true))
                .andExpect(header().string("Cache-Control", "no-store")).andExpect(header().doesNotExist("Set-Cookie"))
                .andExpect(header().doesNotExist("Retry-After"))
                .andReturn().getResponse().getContentAsString();
    }
    ResultActions redeem(String token, String password) throws Exception {
        return mvc.perform(post("/api/auth/password-resets").with(r -> { r.setRemoteAddr(trafficOrigin); return r; }).contentType("application/json").content(mapper.writeValueAsString(Map.of("token", token, "password", password))));
    }
    ResultActions me(String accessToken) throws Exception { return mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + accessToken)); }
    String link(String email) throws Exception {
        long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) { String found = links.get(email); if (found != null) return found; Thread.sleep(50); }
        throw new AssertionError("No recovery mail captured for " + email);
    }
    String token(String email) throws Exception { String link = link(email); return link.substring(link.indexOf("#token=") + 7); }
    int activeTokens(UUID accountId) {
        return jdbc.queryForObject("SELECT count(*) FROM password_recovery_tokens WHERE account_id = ? AND consumed_at IS NULL", Integer.class, accountId);
    }
    RegistrationResponse citizen() { return registration.register(new RegistrationRequest("Pessoa cidadã", UUID.randomUUID() + "@example.com", PASSWORD)); }
    UserAccount pendingAdmin() { return accounts.saveAndFlush(UserAccount.pendingAdmin("Administração pendente", UUID.randomUUID() + "@example.com", NOW)); }
    UserAccount activeAdmin() {
        var account = UserAccount.pendingAdmin("Administração ativa", UUID.randomUUID() + "@example.com", NOW);
        account.activateAdmin(encoder.encode(PASSWORD), NOW);
        return accounts.saveAndFlush(account);
    }
    UserAccount disabledAdmin() {
        var account = UserAccount.pendingAdmin("Administração desativada", UUID.randomUUID() + "@example.com", NOW);
        account.activateAdmin(encoder.encode(PASSWORD), NOW); account.disableAdmin(NOW);
        return accounts.saveAndFlush(account);
    }
}