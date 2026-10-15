package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.administration.*;
import com.project.software.urbanreports.auth.*;
import com.project.software.urbanreports.identity.*;
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
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.*;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint=", "admin.frontend-origin=http://localhost:5173"})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class OccurrenceReportIntegrationTests {
    static final String PATH = "/api/admin/reports/occurrences";
    static final String PASSWORD = "synthetic strong password phrase";
    static final Instant NOW = Instant.parse("2026-10-15T12:00:00Z");
    @Autowired OccurrenceReportService service;
    @Autowired ModerationService moderation;
    @Autowired AdminProvisioningService administration;
    @Autowired BootstrapService bootstrap;
    @Autowired RegistrationService registration;
    @Autowired LoginService login;
    @Autowired OccurrenceRepository occurrences;
    @Autowired OccurrenceCategoryRepository categories;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @MockitoBean Clock clock;
    @MockitoBean ActivationMailSender mail;
    @MockitoSpyBean AccountAccess access;
    AuthenticatedIdentity admin, root;
    LoginService.Result adminLogin, rootLogin, citizenLogin;
    UUID author;

    @BeforeEach void setup() {
        when(clock.instant()).thenReturn(NOW); when(clock.getZone()).thenReturn(ZoneOffset.UTC);
        bootstrap.createFirst("Responsável teste", "root@example.com", PASSWORD);
        rootLogin = login.login("root@example.com", PASSWORD); root = identity(rootLogin);
        var link = new java.util.concurrent.atomic.AtomicReference<String>();
        doAnswer(call -> { link.set(call.getArgument(1)); return null; }).when(mail).send(anyString(), anyString());
        var invitation = administration.create(root, "Pessoa administradora", "admin@example.com");
        administration.activate(link.get().split("#token=")[1], PASSWORD);
        adminLogin = login.login(invitation.admin().email(), PASSWORD); admin = identity(adminLogin);
        author = registration.register(new RegistrationRequest("Pessoa cidadã", "user@example.com", PASSWORD)).id();
        citizenLogin = login.login("user@example.com", PASSWORD);
    }

    @Test void referenceDatasetUsesCurrentStatusesFinalEventsAndAllCategories() throws Exception {
        report(1, "Centro", 0);
        var analysis = report(1, "Centro", 0); transition(analysis, "0", OccurrenceStatus.IN_ANALYSIS);
        resolve(report(2, "Bairro A", 7200)); resolve(report(2, "Bairro A", 21600));
        transition(report(1, "  ", 0), "0", OccurrenceStatus.REJECTED);
        transition(report(2, " Centro ", 0), "0", OccurrenceStatus.REJECTED);
        var result = service.get(admin);
        assertThat(result.total()).isEqualTo(6);
        assertThat(result.categories()).hasSize(8);
        assertThat(result.categories()).extracting(OccurrenceReportService.CategoryCount::count).containsExactly(3L, 3L, 0L, 0L, 0L, 0L, 0L, 0L);
        assertThat(result.statuses()).extracting(OccurrenceReportService.StatusCount::count).containsExactly(1L, 1L, 2L, 2L);
        assertThat(result.localities()).containsExactly(new OccurrenceReportService.LocalityCount("Centro", 3),
                new OccurrenceReportService.LocalityCount("Bairro A", 2), new OccurrenceReportService.LocalityCount(null, 1));
        assertThat(result.averageResolutionSeconds()).isEqualByComparingTo("14400");
        assertThat(result.resolvedSampleSize()).isEqualTo(2); assertThat(result.resolvedWithoutValidDuration()).isZero();
        assertThat(result.rejectedPercentage().doubleValue()).isCloseTo(100.0 / 3, within(0.000001));
        sums(result);
        mvc.perform(get(PATH).header("Authorization", "Bearer " + adminLogin.accessToken()))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.total").value(6)).andExpect(jsonPath("$.averageResolutionSeconds").value(14400))
                .andExpect(jsonPath("$.author").doesNotExist()).andExpect(jsonPath("$.history").doesNotExist())
                .andExpect(jsonPath("$.categories[0].categoryId").value(1));
    }

    @Test void emptyPendingRejectedAndResolvedOnlyPreserveNullVersusZeroAndElapsedDays() {
        var empty = service.get(admin); sums(empty);
        assertThat(empty.total()).isZero(); assertThat(empty.averageResolutionSeconds()).isNull(); assertThat(empty.rejectedPercentage()).isNull();
        assertThat(empty.statuses()).hasSize(4); assertThat(empty.localities()).isEmpty();
        var pending = report(1, "Centro", 0);
        var onlyPending = service.get(admin);
        assertThat(onlyPending.rejectedPercentage()).isEqualByComparingTo("0"); assertThat(onlyPending.averageResolutionSeconds()).isNull();
        transition(pending, "0", OccurrenceStatus.REJECTED);
        var onlyRejected = service.get(admin);
        assertThat(onlyRejected.rejectedPercentage()).isEqualByComparingTo("100"); assertThat(onlyRejected.averageResolutionSeconds()).isNull();
        resolve(report(1, "Centro", 0));
        assertThat(service.get(admin).averageResolutionSeconds()).isEqualByComparingTo("0");
        resolve(report(1, "Centro", 183600)); // 2 days + 3 hours, continuously elapsed
        assertThat(service.get(admin).averageResolutionSeconds()).isEqualByComparingTo("91800");
        sums(service.get(admin));
    }

    @Test void resolvedOnlyUsesCreationEvenAfterEditsAndUnroundedSubsecondDurations() {
        var edited = report(1, "Centro", 90000.125);
        edited.update(categories.findById(2).orElseThrow(), "Relato editado", null, "Outro bairro", "Praça central", edited.getImageKey());
        occurrences.saveAndFlush(edited);
        transition(edited, "1", OccurrenceStatus.IN_ANALYSIS); transition(edited, "2", OccurrenceStatus.RESOLVED);
        resolve(report(1, "Centro", 0.375));
        var result = service.get(admin); sums(result);
        assertThat(result.averageResolutionSeconds()).isEqualByComparingTo("45000.25");
        assertThat(result.rejectedPercentage()).isEqualByComparingTo("0");
        assertThat(result.resolvedSampleSize()).isEqualTo(2);
        assertThat(result.resolvedWithoutValidDuration()).isZero();
        assertThat(result.statuses()).extracting(OccurrenceReportService.StatusCount::count).containsExactly(0L, 0L, 2L, 0L);
    }

    @Test void excludesRepresentableInconsistenciesWithoutWeakeningConstraints() {
        var missing = report(1, "Centro", 1);
        jdbc.update("UPDATE occurrences SET status = 'RESOLVED', version = 1 WHERE id = ?", missing.getId());
        var negative = report(1, "Centro", -1); resolve(negative);
        var duplicate = report(1, "Centro", 100); resolve(duplicate);
        jdbc.update("INSERT INTO occurrence_history(id, occurrence_id, previous_status, new_status, moderator_id, occurred_at, version) VALUES (?, ?, 'IN_ANALYSIS', 'RESOLVED', ?, ?, 3)",
                UUID.randomUUID(), duplicate.getId(), admin.userId(), java.sql.Timestamp.from(NOW));
        jdbc.update("UPDATE occurrences SET version = 3 WHERE id = ?", duplicate.getId());
        var invalid = service.get(admin);
        assertThat(invalid.averageResolutionSeconds()).isNull(); assertThat(invalid.resolvedSampleSize()).isZero();
        assertThat(invalid.resolvedWithoutValidDuration()).isEqualTo(3);
        resolve(report(2, "Centro", 0.5));
        var partial = service.get(admin);
        assertThat(partial.averageResolutionSeconds()).isEqualByComparingTo("0.5"); assertThat(partial.resolvedSampleSize()).isEqualTo(1);
        assertThat(partial.resolvedWithoutValidDuration()).isEqualTo(3); sums(partial);
    }

    @Test void allLocalitiesPhysicalDeletionAndMoreThanFiftyRowsUseSamePopulation() {
        for (int i = 0; i < 53; i++) report(1, "Centro", 0);
        report(2, " centro ", 0); report(2, "Céntro", 0); report(2, "\t \n", 0);
        report(2, "Não informado", 0); report(2, "<script>alert(1)</script>", 0);
        var deleted = report(2, "Removida", 0); occurrences.deleteById(deleted.getId());
        var result = service.get(admin); sums(result);
        assertThat(result.total()).isEqualTo(58);
        assertThat(result.localities().getFirst()).isEqualTo(new OccurrenceReportService.LocalityCount("Centro", 53));
        assertThat(result.localities()).extracting(OccurrenceReportService.LocalityCount::locality)
                .containsExactly("Centro", "<script>alert(1)</script>", "Céntro", "Não informado", "centro", null);
        assertThat(jdbc.queryForObject("SELECT neighborhood FROM occurrences WHERE neighborhood = ' centro '", String.class)).isEqualTo(" centro ");
        resolve(occurrences.findAll().getFirst());
        assertThat(service.get(admin).resolvedSampleSize()).isEqualTo(1);
    }

    @Test void exactRolesRealSessionsAndDeactivationDenyAggregates() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        for (var user : List.of(citizenLogin, rootLogin)) {
            mvc.perform(get(PATH).header("Authorization", "Bearer " + user.accessToken())).andExpect(status().isForbidden());
            assertThatThrownBy(() -> service.get(identity(user))).isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        }
        mvc.perform(get(PATH).header("Authorization", "Bearer " + adminLogin.accessToken())).andExpect(status().isOk());
        mvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + adminLogin.accessToken()).contentType("application/json")).andExpect(status().isNoContent());
        mvc.perform(get(PATH).header("Authorization", "Bearer " + adminLogin.accessToken())).andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> service.get(admin)).isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        adminLogin = login.login("admin@example.com", PASSWORD); admin = identity(adminLogin);
        administration.deactivate(root, admin.userId());
        mvc.perform(get(PATH).header("Authorization", "Bearer " + adminLogin.accessToken())).andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> service.get(admin)).isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
    }

    @Test void snapshotRemainsConsistentWhileModerationCommitsWithoutWaitingForReport() throws Exception {
        var occurrence = report(1, "Centro", 7200); transition(occurrence, "0", OccurrenceStatus.IN_ANALYSIS);
        var snapshot = new CountDownLatch(1); var release = new CountDownLatch(1);
        AccountAccess accessSpy = org.springframework.test.util.AopTestUtils.getUltimateTargetObject(access);
        doAnswer(call -> {
            call.callRealMethod(); snapshot.countDown();
            if (!release.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Snapshot timeout");
            return null;
        }).when(accessSpy).check(admin, AccountRole.ADMIN);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var reading = executor.submit(() -> service.get(admin));
            try {
                assertThat(snapshot.await(10, TimeUnit.SECONDS)).isTrue();
                executor.submit(() -> transition(occurrence, "1", OccurrenceStatus.RESOLVED)).get(10, TimeUnit.SECONDS);
            } finally { release.countDown(); }
            var before = reading.get(10, TimeUnit.SECONDS); sums(before);
            assertThat(before.statuses()).extracting(OccurrenceReportService.StatusCount::count).containsExactly(0L, 1L, 0L, 0L);
            assertThat(before.averageResolutionSeconds()).isNull();
        }
        doCallRealMethod().when(accessSpy).check(admin, AccountRole.ADMIN);
        var after = service.get(admin); sums(after);
        assertThat(after.statuses()).extracting(OccurrenceReportService.StatusCount::count).containsExactly(0L, 0L, 1L, 0L);
        assertThat(after.averageResolutionSeconds()).isEqualByComparingTo("7200");
    }

    private Occurrence report(int category, String locality, double seconds) {
        return occurrences.saveAndFlush(new Occurrence(author, categories.findById(category).orElseThrow(), "Relato sintético", null,
                locality, "Praça central", "occurrences/" + UUID.randomUUID() + ".png", NOW.minusNanos((long) (seconds * 1_000_000_000))));
    }
    private void resolve(Occurrence report) { transition(report, "0", OccurrenceStatus.IN_ANALYSIS); transition(report, "1", OccurrenceStatus.RESOLVED); }
    private ModerationService.Detail transition(Occurrence report, String version, OccurrenceStatus target) {
        return moderation.transition(admin, report.getId(), "\"" + version + "\"", new OccurrenceTransition(target, target == OccurrenceStatus.REJECTED ? "Justificativa sintética" : null));
    }
    private AuthenticatedIdentity identity(LoginService.Result result) {
        UUID session = jdbc.queryForObject("SELECT id FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1", UUID.class, result.user().id());
        return new AuthenticatedIdentity(result.user().id(), session, result.user());
    }
    private void sums(OccurrenceReportService.Report report) {
        assertThat(report.categories().stream().mapToLong(OccurrenceReportService.CategoryCount::count).sum()).isEqualTo(report.total());
        assertThat(report.statuses().stream().mapToLong(OccurrenceReportService.StatusCount::count).sum()).isEqualTo(report.total());
        assertThat(report.localities().stream().mapToLong(OccurrenceReportService.LocalityCount::count).sum()).isEqualTo(report.total());
    }
}
