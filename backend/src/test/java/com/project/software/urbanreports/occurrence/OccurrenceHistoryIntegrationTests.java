package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.identity.*;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint="})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class OccurrenceHistoryIntegrationTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired RegistrationService registration;
    @Autowired OccurrenceRepository occurrences;
    @Autowired OccurrenceCategoryRepository categories;
    @Autowired OccurrenceService service;
    @Autowired PlatformTransactionManager transactions;
    @Autowired com.project.software.urbanreports.auth.LoginService login;
    @Autowired org.flywaydb.core.Flyway flyway;

    @Test void historyIsImmutableAndReferencesCannotBeDeleted() {
        var author = account();
        var moderatorFixture = account();
        var report = report(author.id());
        UUID event = append(report.getId(), moderatorFixture.id(), "Justificativa válida", 1);
        for (String statement : new String[] {
                "UPDATE occurrence_history SET reason = 'Outra justificativa' WHERE id = ?",
                "DELETE FROM occurrence_history WHERE id = ?"}) {
            assertThatThrownBy(() -> jdbc.update(statement, event)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        }
        assertThatThrownBy(() -> jdbc.execute("TRUNCATE occurrence_history CASCADE"))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM occurrences WHERE id = ?", report.getId()))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM user_accounts WHERE id = ?", moderatorFixture.id()))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(count("occurrence_history", "id", event)).isEqualTo(1);
        assertThat(count("occurrence_notification_outbox", "event_id", event)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT recipient_id FROM occurrence_notification_outbox WHERE event_id = ?", UUID.class, event)).isEqualTo(author.id());
    }

    @Test void appendAndNotificationIntentRollbackTogetherAndDuplicateVersionDoesNotEnqueue() {
        var author = account();
        var report = report(author.id());
        var tx = new TransactionTemplate(transactions);
        tx.executeWithoutResult(status -> {
            append(report.getId(), author.id(), "Justificativa válida", 1);
            status.setRollbackOnly();
        });
        assertThat(count("occurrence_history", "occurrence_id", report.getId())).isZero();
        assertThat(count("occurrence_notification_outbox", "recipient_id", author.id())).isZero();
        append(report.getId(), author.id(), "Justificativa válida", 1);
        assertThatThrownBy(() -> append(report.getId(), author.id(), "Outra justificativa", 1))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(count("occurrence_history", "occurrence_id", report.getId())).isEqualTo(1);
        assertThat(count("occurrence_notification_outbox", "recipient_id", author.id())).isEqualTo(1);
    }

    @Test void databaseEnforcesUnicodeLengthsTrimAndReasonOnlyForRejection() {
        var author = account();
        var report = report(author.id());
        long version = 1;
        for (String reason : new String[] {"a".repeat(10), "a".repeat(500), "😀".repeat(10), "😀".repeat(500)})
            append(report.getId(), author.id(), reason, version++);
        for (String reason : new String[] {"", " ".repeat(10), "a".repeat(9), "a".repeat(501), "😀".repeat(9), "😀".repeat(501), " Justificativa válida "}) {
            assertThatThrownBy(() -> append(report.getId(), author.id(), reason, 100))
                    .isInstanceOf(org.springframework.dao.DataAccessException.class);
        }
        assertThatThrownBy(() -> append(report.getId(), author.id(), null, 100))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO occurrence_history VALUES (?, ?, 'PENDING', 'IN_ANALYSIS', ?, now(), '', 100)
                """, UUID.randomUUID(), report.getId(), author.id())).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    @Test void rejectedIsAbsentFromAllPublicSurfacesAndAuthorHistoryHidesModeratorIdentity() throws Exception {
        var author = account();
        var moderator = account();
        var report = report(author.id());
        append(report.getId(), moderator.id(), "Justificativa válida", 1);
        jdbc.update("UPDATE occurrences SET status = 'REJECTED', version = 1 WHERE id = ?", report.getId());
        for (String path : new String[] {"/api/public/occurrences/{id}", "/api/public/occurrences/{id}/image"})
            mvc.perform(get(path, report.getId())).andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("OCCURRENCE_NOT_FOUND"));
        mvc.perform(get("/api/public/occurrences").param("size", "50"))
                .andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(report.getId().toString()))));
        var detail = service.findById(author.id(), report.getId());
        assertThat(detail.history()).singleElement().satisfies(event -> {
            assertThat(event.responsible()).isEqualTo("Moderação");
            assertThat(event.reason()).isEqualTo("Justificativa válida");
        });
        assertThatThrownBy(() -> service.findById(moderator.id(), report.getId())).isInstanceOf(OccurrenceNotFoundException.class);
        assertThat(jdbc.queryForObject("SELECT moderator_id FROM occurrence_history WHERE occurrence_id = ?", UUID.class, report.getId())).isEqualTo(moderator.id());
        String token = login.login(author.email(), "synthetic test password long").accessToken();
        mvc.perform(get("/api/occurrences/{id}", report.getId()).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.history[0].responsible").value("Moderação"))
                .andExpect(jsonPath("$.history[0].reason").value("Justificativa válida"))
                .andExpect(jsonPath("$.history[0].moderatorId").doesNotExist())
                .andExpect(jsonPath("$.history[0].email").doesNotExist());
        String strangerToken = login.login(moderator.email(), "synthetic test password long").accessToken();
        mvc.perform(get("/api/occurrences/{id}", report.getId()).header("Authorization", "Bearer " + strangerToken))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/occurrences/{id}", report.getId())).andExpect(status().isUnauthorized());
    }

    @Test void upgradingFromV6PreservesExistingReportsAndCreatesNoRetroactiveEvents() {
        // Isolated schema in disposable PostgreSQL only; no shared database is touched.
        String schema = "upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var source = flyway.getConfiguration().getDataSource();
        var previous = org.flywaydb.core.Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema)
                .target("6").load();
        previous.migrate();
        UUID author = UUID.randomUUID(), report = UUID.randomUUID();
        jdbc.update("INSERT INTO " + schema + ".user_accounts(id, name, email, password_hash, role, created_at, updated_at) VALUES (?, 'Pessoa teste', 'upgrade@example.com', 'test-hash', 'USER', now(), now())", author);
        jdbc.update("INSERT INTO " + schema + ".occurrences(id, author_id, category_id, title, neighborhood, reference, image_key, created_at, version) VALUES (?, ?, 1, 'Poste apagado', 'Centro', 'Praça central', 'occurrences/upgrade.png', now(), 4)", report, author);
        var upgraded = org.flywaydb.core.Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("7").load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT version FROM " + schema + ".occurrences WHERE id = ?", Long.class, report)).isEqualTo(4);
        assertThat(jdbc.queryForObject("SELECT status FROM " + schema + ".occurrences WHERE id = ?", String.class, report)).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".occurrence_history", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".occurrence_notification_outbox", Integer.class)).isZero();
        assertThat(upgraded.migrate().migrationsExecuted).isZero();
    }

    private RegistrationResponse account() {
        return registration.register(new RegistrationRequest("Pessoa sintética", UUID.randomUUID() + "@example.com", "synthetic test password long"));
    }

    private Occurrence report(UUID author) {
        return occurrences.saveAndFlush(new Occurrence(author, categories.findById(1).orElseThrow(),
                "Poste apagado na praça", null, "Centro", "Praça central", "occurrences/" + UUID.randomUUID() + ".png", Instant.now()));
    }

    // Database fixtures only: no moderation authorization or command is claimed by these tests.
    private UUID append(UUID report, UUID moderator, String reason, long version) {
        UUID event = UUID.randomUUID();
        jdbc.update("INSERT INTO occurrence_history VALUES (?, ?, 'PENDING', 'REJECTED', ?, now(), ?, ?)",
                event, report, moderator, reason, version);
        return event;
    }

    private int count(String table, String column, UUID id) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE " + column + " = ?", Integer.class, id);
    }
}
