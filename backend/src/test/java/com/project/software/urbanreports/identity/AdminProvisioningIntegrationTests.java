package com.project.software.urbanreports.identity;

import com.project.software.urbanreports.administration.*;
import com.project.software.urbanreports.auth.*;
import com.project.software.urbanreports.occurrence.*;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint=", "admin.frontend-origin=http://localhost:5173"})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AdminProvisioningIntegrationTests {
    static final String PASSWORD = "synthetic strong password phrase";
    static final Instant NOW = Instant.parse("2026-10-15T12:00:00Z");
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired BootstrapService bootstrap;
    @Autowired AdminProvisioningService service;
    @Autowired UserAccountRepository accounts;
    @Autowired RegistrationService registration;
    @Autowired LoginService login;
    @Autowired JdbcTemplate jdbc;
    @Autowired ModerationService moderation;
    @Autowired OccurrenceRepository reports;
    @Autowired OccurrenceCategoryRepository categories;
    @MockitoBean ActivationMailSender mail;
    @MockitoBean Clock clock;
    @MockitoBean com.project.software.urbanreports.storage.application.ImageStorage imageStorage;
    @Autowired com.project.software.urbanreports.storage.application.UploadJournal journal;
    final Map<String, String> invitations = new ConcurrentHashMap<>();
    AuthenticatedIdentity root;
    String rootToken;
    @BeforeEach void setup() {
        when(clock.instant()).thenReturn(NOW); when(clock.getZone()).thenReturn(ZoneOffset.UTC);
        doAnswer(call -> {
            String link = call.getArgument(1);
            invitations.put(call.getArgument(0), link.substring(link.indexOf("#token=") + 7));
            return null;
        }).when(mail).send(anyString(), anyString());
        if (!accounts.existsByRole(AccountRole.SUPER_ADMIN)) bootstrap.createFirst("Responsável teste", "root@example.com", PASSWORD);
        var result = login.login("root@example.com", PASSWORD);
        rootToken = result.accessToken(); root = identity(result);
    }
    @Test void fullLifecyclePreservesAuditAndRevokesExistingSessions() throws Exception {
        var citizen = citizen(); var created = create(); UUID id = created.admin().id();
        assertThat(created.mailStatus()).isEqualTo("ACCEPTED");
        assertThatThrownBy(() -> login.login(created.admin().email(), PASSWORD)).isInstanceOf(org.springframework.security.authentication.BadCredentialsException.class);
        String raw = invitations.get(created.admin().email());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM admin_activation_tokens WHERE account_id = ? AND token_hash = ?", Integer.class, id, raw)).isZero();
        mvc.perform(post("/api/auth/admin-activations").contentType("application/json").content(mapper.writeValueAsString(Map.of("token", raw, "password", PASSWORD))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.activated").value(true)).andExpect(header().doesNotExist("Set-Cookie"));
        assertThatThrownBy(() -> service.activate(raw, PASSWORD)).isInstanceOf(AdministrationException.class);
        var adminLogin = login.login(created.admin().email(), PASSWORD); var admin = identity(adminLogin); var report = report(citizen.id());
        var result = moderation.transition(admin, report.getId(), "\"0\"", new OccurrenceTransition(OccurrenceStatus.IN_ANALYSIS, null));
        assertThat(result.report().version()).isEqualTo(1);
        assertThat(result.history()).singleElement().satisfies(event -> assertThat(event.responsible()).isEqualTo("Pessoa administradora"));
        mvc.perform(get("/api/admin/occurrences/{id}", report.getId()).header("Authorization", "Bearer " + adminLogin.accessToken())).andExpect(status().isOk());
        service.deactivate(root, id); service.deactivate(root, id);
        assertThatThrownBy(() -> login.login(created.admin().email(), PASSWORD)).isInstanceOf(org.springframework.security.authentication.BadCredentialsException.class);
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + adminLogin.accessToken())).andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> moderation.transition(admin, report.getId(), "\"1\"", new OccurrenceTransition(OccurrenceStatus.RESOLVED, null))).isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        assertThat(jdbc.queryForObject("SELECT moderator_id FROM occurrence_history WHERE occurrence_id = ?", UUID.class, report.getId())).isEqualTo(id);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM occurrence_notification_outbox WHERE recipient_id = ?", Integer.class, citizen.id())).isEqualTo(1);
    }
    @Test void occupiedEmailsNeverPromoteAndMailFailureIsRecoverable() {
        var citizen = citizen();
        assertThatThrownBy(() -> service.create(root, "Nome existente", " " + citizen.email().toUpperCase(Locale.ROOT) + " ")).isInstanceOf(AdministrationException.class);
        assertThat(accounts.findById(citizen.id()).orElseThrow().getRole()).isEqualTo(AccountRole.USER);
        doThrow(new IllegalStateException("Provider unavailable")).when(mail).send(anyString(), anyString());
        var created = create(); assertThat(created.mailStatus()).isEqualTo("FAILED");
        assertThat(accounts.findById(created.admin().id()).orElseThrow().getStatus()).isEqualTo(AccountStatus.PENDING_ACTIVATION);
        reset(mail); assertThat(service.resend(root, created.admin().id()).mailStatus()).isEqualTo("ACCEPTED");
    }
    @Test void invalidPasswordDoesNotConsumeAndExpiryIsExclusive() {
        var created = create(); String token = invitations.get(created.admin().email());
        assertThatThrownBy(() -> service.activate(token, "weak")).isInstanceOfSatisfying(AdministrationException.class, e -> assertThat(e.code).isEqualTo("INVALID_PASSWORD"));
        when(clock.instant()).thenReturn(NOW.plusSeconds(86400));
        assertThatThrownBy(() -> service.activate(token, PASSWORD)).isInstanceOfSatisfying(AdministrationException.class, e -> assertThat(e.code).isEqualTo("INVALID_ACTIVATION_LINK"));
        when(clock.instant()).thenReturn(NOW.plusSeconds(86399)); service.activate(token, PASSWORD);
        assertThat(accounts.findById(created.admin().id()).orElseThrow().isActive()).isTrue();
    }
    @Test void resendInvalidatesAndDeactivationPreventsLaterActivation() {
        var created = create(); String old = invitations.get(created.admin().email());
        service.resend(root, created.admin().id()); String latest = invitations.get(created.admin().email());
        assertThatThrownBy(() -> service.activate(old, PASSWORD)).isInstanceOf(AdministrationException.class);
        service.deactivate(root, created.admin().id());
        assertThatThrownBy(() -> service.activate(latest, PASSWORD)).isInstanceOf(AdministrationException.class);
        assertThatThrownBy(() -> service.resend(root, created.admin().id())).isInstanceOf(AdministrationException.class);
        assertThatThrownBy(() -> service.create(root, "Outra pessoa", created.admin().email())).isInstanceOf(AdministrationException.class);
    }
    @Test void concurrentActivationConsumesExactlyOnce() throws Exception {
        var created = create(); String token = invitations.get(created.admin().email()); var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            List<Future<Boolean>> attempts = new ArrayList<>();
            for (int i = 0; i < 2; i++) attempts.add(executor.submit(() -> {
                start.await(); try { service.activate(token, PASSWORD); return true; } catch (AdministrationException invalid) { return false; }
            }));
            start.countDown();
            assertThat(List.of(attempts.get(0).get(20, TimeUnit.SECONDS), attempts.get(1).get(20, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
    }
    @Test void chainEnforcesExactRolesAndUniformPublicTokenErrors() throws Exception {
        var citizenLogin = login.login(citizen().email(), PASSWORD);
        var created = create(); service.activate(invitations.get(created.admin().email()), PASSWORD);
        var adminLogin = login.login(created.admin().email(), PASSWORD);
        for (String token : List.of(citizenLogin.accessToken(), adminLogin.accessToken())) {
            mvc.perform(get("/api/super-admin/admins").header("Authorization", "Bearer " + token)).andExpect(status().isForbidden());
            mvc.perform(post("/api/super-admin/admins").contentType("application/json").content("{}").header("Authorization", "Bearer " + token)).andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/super-admin/admins")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/super-admin/admins").header("Authorization", "Bearer " + rootToken)).andExpect(status().isOk());
        mvc.perform(get("/api/admin/occurrences").header("Authorization", "Bearer " + rootToken)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/occurrences").header("Authorization", "Bearer " + citizenLogin.accessToken())).andExpect(status().isForbidden());
        mvc.perform(post("/api/occurrences").header("Authorization", "Bearer " + adminLogin.accessToken())).andExpect(status().isForbidden());
        for (String token : List.of("", "not-a-token", "A".repeat(43)))
            mvc.perform(post("/api/auth/admin-activations").contentType("application/json").content(mapper.writeValueAsString(Map.of("token", token, "password", PASSWORD))))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_ACTIVATION_LINK"));
    }
    @Autowired OccurrenceService ownReports;
    @Autowired org.springframework.transaction.PlatformTransactionManager manager;
    @Test void concurrentCreationAndResendKeepOneAccountAndOneUsableInvitation() throws Exception {
        String email = UUID.randomUUID() + "@example.com";
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> operation = () -> {
                gate.await();
                try { service.create(root, "Pessoa administradora", email); return true; }
                catch (AdministrationException conflict) { return false; }
            };
            var first = executor.submit(operation); var second = executor.submit(operation); gate.countDown();
            assertThat(List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        var account = accounts.findByEmail(email).orElseThrow();
        var captured = new ConcurrentLinkedQueue<String>();
        doAnswer(call -> { String link = call.getArgument(1); captured.add(link.substring(link.indexOf("#token=") + 7)); return null; }).when(mail).send(eq(email), anyString());
        var resendGate = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Void> resend = () -> { resendGate.await(); service.resend(root, account.getId()); return null; };
            var first = executor.submit(resend); var second = executor.submit(resend); resendGate.countDown();
            first.get(20, TimeUnit.SECONDS); second.get(20, TimeUnit.SECONDS);
        }
        int accepted = 0;
        for (String raw : captured) { try { service.activate(raw, PASSWORD); accepted++; } catch (AdministrationException invalid) { /* Replaced invitation. */ } }
        assertThat(accepted).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_accounts WHERE email = ?", Integer.class, email)).isEqualTo(1);
    }
    @Test void twoModeratorsWithSameVersionConfirmOneEventAndOneIntent() throws Exception {
        var firstAdmin = activatedAdmin(); var secondAdmin = activatedAdmin();
        var citizen = citizen(); var report = report(citizen.id()); var gate = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> transitionAttempt(firstAdmin, report.getId(), gate));
            var second = executor.submit(() -> transitionAttempt(secondAdmin, report.getId(), gate)); gate.countDown();
            assertThat(List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS))).containsExactlyInAnyOrder(200, 412);
        }
        assertThat(reports.findById(report.getId()).orElseThrow().getVersion()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM occurrence_history WHERE occurrence_id = ?", Integer.class, report.getId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM occurrence_notification_outbox WHERE recipient_id = ?", Integer.class, citizen.id())).isEqualTo(1);
    }
    @Test void moderationInvalidatesOldAuthorDraftAndPreventsDeletion() {
        var admin = activatedAdmin(); var citizen = citizen(); var report = report(citizen.id());
        moderation.transition(admin, report.getId(), "\"0\"", new OccurrenceTransition(OccurrenceStatus.IN_ANALYSIS, null));
        assertThatThrownBy(() -> ownReports.update(citizen.id(), report.getId(), "\"0\"", new OccurrenceRequest(1, "Título editado", null, "Centro", "Praça central"), null)).isInstanceOf(OccurrenceWriteException.class);
        assertThatThrownBy(() -> ownReports.delete(citizen.id(), report.getId(), "\"0\"")).isInstanceOf(OccurrenceWriteException.class);
        var resolved = moderation.transition(admin, report.getId(), "\"1\"", new OccurrenceTransition(OccurrenceStatus.RESOLVED, null));
        assertThat(resolved.report().status()).isEqualTo(OccurrenceStatus.RESOLVED);
        assertThat(resolved.history()).hasSize(2);
    }
    @Test void rejectedFromEachAllowedSourceAndFailedCommitRollsBackStateEventAndIntent() {
        var admin = activatedAdmin();
        for (boolean analyze : new boolean[] {false, true}) {
            var report = report(citizen().id());
            if (analyze) moderation.transition(admin, report.getId(), "\"0\"", new OccurrenceTransition(OccurrenceStatus.IN_ANALYSIS, null));
            var result = moderation.transition(admin, report.getId(), analyze ? "\"1\"" : "\"0\"", new OccurrenceTransition(OccurrenceStatus.REJECTED, "  Justificativa válida  "));
            assertThat(result.report().status()).isEqualTo(OccurrenceStatus.REJECTED);
            assertThat(result.history().getLast().reason()).isEqualTo("Justificativa válida");
        }
        var citizen = citizen(); var report = report(citizen.id());
        jdbc.execute("CREATE FUNCTION fail_moderation_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.occurrence_id = '" + report.getId() + "'::uuid THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE CONSTRAINT TRIGGER moderation_commit_failure AFTER INSERT ON occurrence_history DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_moderation_commit()");
        try {
            assertThatThrownBy(() -> moderation.transition(admin, report.getId(), "\"0\"", new OccurrenceTransition(OccurrenceStatus.IN_ANALYSIS, null))).isInstanceOf(RuntimeException.class);
            assertThat(reports.findById(report.getId()).orElseThrow().getStatus()).isEqualTo(OccurrenceStatus.PENDING);
            assertThat(reports.findById(report.getId()).orElseThrow().getVersion()).isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM occurrence_history WHERE occurrence_id = ?", Integer.class, report.getId())).isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM occurrence_notification_outbox WHERE recipient_id = ?", Integer.class, citizen.id())).isZero();
        } finally { jdbc.execute("DROP TRIGGER moderation_commit_failure ON occurrence_history"); jdbc.execute("DROP FUNCTION fail_moderation_commit()"); }
    }
    @Test void racingDeactivationWithActivationOrModerationAlwaysEndsDisabled() throws Exception {
        var invitation = create(); String raw = invitations.get(invitation.admin().email());
        runTogether(() -> { try { service.activate(raw, PASSWORD); } catch (AdministrationException invalid) { /* Disabled first. */ } },
                () -> service.deactivate(root, invitation.admin().id()));
        assertThat(accounts.findById(invitation.admin().id()).orElseThrow().getStatus()).isEqualTo(AccountStatus.DISABLED);
        assertThatThrownBy(() -> service.activate(raw, PASSWORD)).isInstanceOf(AdministrationException.class);
        var admin = activatedAdmin(); var report = report(citizen().id());
        runTogether(() -> { try { moderation.transition(admin, report.getId(), "\"0\"", new OccurrenceTransition(OccurrenceStatus.IN_ANALYSIS, null)); }
                catch (org.springframework.security.access.AccessDeniedException denied) { /* Disabled first. */ } },
                () -> service.deactivate(root, admin.userId()));
        assertThat(accounts.findById(admin.userId()).orElseThrow().getStatus()).isEqualTo(AccountStatus.DISABLED);
        assertThatThrownBy(() -> moderation.find(admin, report.getId())).isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        var tx = new org.springframework.transaction.support.TransactionTemplate(manager);
        tx.executeWithoutResult(status -> accounts.lockById(admin.userId()).orElseThrow().changePasswordHash(
                "$argon2id$disabled-test-credential", NOW));
        assertThat(accounts.findById(admin.userId()).orElseThrow().getStatus()).isEqualTo(AccountStatus.DISABLED);
    }
    @Test void moderationRacingAuthorEditsAndDeletesPreservesVersionsAndNoOrphans() throws Exception {
        var admin = activatedAdmin(); var citizen = citizen(); var report = report(citizen.id());
        runTogether(() -> { try { moderation.transition(admin, report.getId(), "\"0\"", new OccurrenceTransition(OccurrenceStatus.IN_ANALYSIS, null)); } catch (OccurrenceWriteException stale) { /* Author won. */ } },
                () -> { try { ownReports.update(citizen.id(), report.getId(), "\"0\"", new OccurrenceRequest(1, "Título editado", null, "Centro", "Praça central", "0", "123.123456789"), null); } catch (OccurrenceWriteException stale) { /* Moderator won. */ } });
        var after = reports.findById(report.getId()).orElseThrow();
        assertThat(after.getVersion()).isEqualTo(1);
        if (after.getStatus() == OccurrenceStatus.IN_ANALYSIS) {
            assertThat(after.getLatitude()).isNull(); assertThat(after.getLongitude()).isNull();
        } else {
            assertThat(after.getLatitude()).isZero(); assertThat(after.getLongitude()).isEqualTo(123.123456789);
        }
        assertThat(moderation.find(admin, report.getId()).report().latitude()).isEqualTo(after.getLatitude());
        assertThat(moderation.find(admin, report.getId()).report().longitude()).isEqualTo(after.getLongitude());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM occurrence_history WHERE occurrence_id = ?", Integer.class, report.getId()))
                .isEqualTo(after.getStatus() == OccurrenceStatus.IN_ANALYSIS ? 1 : 0);
        var deleted = report(citizen.id());
        runTogether(() -> { try { moderation.transition(admin, deleted.getId(), "\"0\"", new OccurrenceTransition(OccurrenceStatus.IN_ANALYSIS, null)); } catch (OccurrenceNotFoundException gone) { /* Author won. */ } },
                () -> { try { ownReports.delete(citizen.id(), deleted.getId(), "\"0\""); } catch (OccurrenceWriteException changed) { /* Moderator won. */ } });
        var surviving = reports.findById(deleted.getId());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM occurrence_history WHERE occurrence_id = ?", Integer.class, deleted.getId())).isEqualTo(surviving.isPresent() ? 1 : 0);
        surviving.ifPresent(value -> assertThat(value.getStatus()).isEqualTo(OccurrenceStatus.IN_ANALYSIS));
    }
    private void runTogether(Runnable first, Runnable second) throws Exception {
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var one = executor.submit(() -> { gate.await(); first.run(); return true; });
            var two = executor.submit(() -> { gate.await(); second.run(); return true; }); gate.countDown();
            one.get(20, TimeUnit.SECONDS); two.get(20, TimeUnit.SECONDS);
        }
    }
    @Test void moderationHttpContractAndProtectedPhotographUseRealChain() throws Exception {
        var admin = activatedAdmin(); var citizen = citizen(); var report = report(citizen.id());
        String bearer = login.login(accounts.findById(admin.userId()).orElseThrow().getEmail(), PASSWORD).accessToken();
        byte[] png = java.nio.file.Files.readAllBytes(java.nio.file.Path.of("src/test/resources/images/photo.png"));
        when(imageStorage.load(anyString())).thenReturn(new com.project.software.urbanreports.storage.application.StoredImageContent(png, png.length, "image/png"));
        mvc.perform(get("/api/admin/occurrences/{id}/image", report.getId()).header("Authorization", "Bearer " + bearer))
                .andExpect(status().isOk()).andExpect(content().bytes(png)).andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(get("/api/admin/occurrences/{id}/image", report.getId()).header("Authorization", "Bearer " + rootToken)).andExpect(status().isForbidden());
        String path = "/api/admin/occurrences/" + report.getId() + "/transitions";
        mvc.perform(post(path).header("Authorization", "Bearer " + bearer).contentType("application/json").content("{\"target\":\"IN_ANALYSIS\"}"))
                .andExpect(status().isPreconditionRequired());
        mvc.perform(post(path).header("Authorization", "Bearer " + bearer).header("If-Match", "\"0\"").contentType("application/json").content("{\"target\":\"RESOLVED\"}"))
                .andExpect(status().isConflict());
        mvc.perform(post(path).header("Authorization", "Bearer " + bearer).header("If-Match", "\"0\"").contentType("application/json").content("{\"target\":\"REJECTED\",\"reason\":\"short\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post(path).header("Authorization", "Bearer " + bearer).header("If-Match", "\"0\"").contentType("application/json").content("{\"target\":\"IN_ANALYSIS\"}"))
                .andExpect(status().isOk()).andExpect(header().string("ETag", "\"1\""))
                .andExpect(jsonPath("$.report.status").value("IN_ANALYSIS")).andExpect(jsonPath("$.history[0].responsible").value("Pessoa administradora"));
        mvc.perform(post(path).header("Authorization", "Bearer " + bearer).header("If-Match", "\"0\"").contentType("application/json").content("{\"target\":\"RESOLVED\"}"))
                .andExpect(status().isPreconditionFailed());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM occurrence_history WHERE occurrence_id = ?", Integer.class, report.getId())).isEqualTo(1);
    }
    @Test void photoReplacementLosingToModerationLeavesRecoverableJournalAndPreservesOldPhoto() throws Exception {
        var admin = activatedAdmin(); var citizen = citizen(); var report = report(citizen.id());
        byte[] png = java.nio.file.Files.readAllBytes(java.nio.file.Path.of("src/test/resources/images/photo.png"));
        var uploaded = new CountDownLatch(1); var release = new CountDownLatch(1);
        var replacement = new java.util.concurrent.atomic.AtomicReference<String>();
        doAnswer(call -> { replacement.set(call.getArgument(0)); uploaded.countDown();
            if (!release.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Test release timeout"); return null;
        }).when(imageStorage).storeAt(anyString(), any(), anyLong(), anyString());
        try (var executor = Executors.newSingleThreadExecutor()) {
            var update = executor.submit(() -> ownReports.update(citizen.id(), report.getId(), "\"0\"", new OccurrenceRequest(1, "Título editado", null, "Centro", "Praça central"),
                    new org.springframework.mock.web.MockMultipartFile("image", "replacement.png", "image/png", png)));
            try {
                assertThat(uploaded.await(10, TimeUnit.SECONDS)).isTrue();
                moderation.transition(admin, report.getId(), "\"0\"", new OccurrenceTransition(OccurrenceStatus.IN_ANALYSIS, null));
            } finally { release.countDown(); }
            assertThatThrownBy(() -> update.get(20, TimeUnit.SECONDS)).hasCauseInstanceOf(OccurrenceWriteException.class);
        }
        assertThat(reports.findById(report.getId()).orElseThrow().getImageKey()).isEqualTo(report.getImageKey());
        assertThat(jdbc.queryForObject("SELECT state FROM image_upload_journal WHERE image_key = ?", String.class, replacement.get())).isEqualTo("PENDING");
        when(clock.instant()).thenReturn(NOW.plusSeconds(601)); journal.recover();
        verify(imageStorage).delete(replacement.get()); verify(imageStorage, never()).delete(report.getImageKey());
        assertThat(jdbc.queryForObject("SELECT state FROM image_upload_journal WHERE image_key = ?", String.class, replacement.get())).isEqualTo("TOMBSTONE");
    }
    private AuthenticatedIdentity activatedAdmin() {
        var invitation = create(); service.activate(invitations.get(invitation.admin().email()), PASSWORD);
        return identity(login.login(invitation.admin().email(), PASSWORD));
    }
    private int transitionAttempt(AuthenticatedIdentity admin, UUID report, CountDownLatch gate) throws Exception {
        gate.await();
        try { moderation.transition(admin, report, "\"0\"", new OccurrenceTransition(OccurrenceStatus.IN_ANALYSIS, null)); return 200; }
        catch (OccurrenceWriteException conflict) { return conflict.status.value(); }
    }
    private AdminProvisioningService.Invitation create() { return service.create(root, "Pessoa administradora", UUID.randomUUID() + "@example.com"); }
    private RegistrationResponse citizen() { return registration.register(new RegistrationRequest("Pessoa cidadã", UUID.randomUUID() + "@example.com", PASSWORD)); }
    private AuthenticatedIdentity identity(LoginService.Result result) {
        UUID session = jdbc.queryForObject("SELECT id FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", UUID.class, result.user().id());
        return new AuthenticatedIdentity(result.user().id(), session, result.user());
    }
    private Occurrence report(UUID author) { return reports.saveAndFlush(new Occurrence(author, categories.findById(1).orElseThrow(), "Poste apagado na praça", null, "Centro", "Praça central", "occurrences/" + UUID.randomUUID() + ".png", NOW)); }
}
