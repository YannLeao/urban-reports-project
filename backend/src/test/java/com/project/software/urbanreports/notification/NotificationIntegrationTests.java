package com.project.software.urbanreports.notification;

import com.project.software.urbanreports.auth.*;
import com.project.software.urbanreports.identity.*;
import com.project.software.urbanreports.occurrence.*;
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
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint="})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class NotificationIntegrationTests {
    private static final String PASSWORD = "synthetic test password long";
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired RegistrationService registration;
    @Autowired LoginService login;
    @Autowired OccurrenceRepository reports;
    @Autowired OccurrenceCategoryRepository categories;
    @Autowired NotificationService service;
    @Autowired org.flywaydb.core.Flyway flyway;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;

    @Test void ownershipPaginationUnreadCountAndIdempotentReadingThroughRealSecurity() throws Exception {
        var author = account(); var stranger = account();
        UUID first = append(author.id()), second = append(author.id()), other = append(stranger.id());
        String token = login.login(author.email(), PASSWORD).accessToken();
        mvc.perform(get("/api/notifications").header("Authorization", "Bearer " + token).param("size", "1"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.totalItems").value(2))
                .andExpect(jsonPath("$.totalPages").value(2)).andExpect(jsonPath("$.unreadCount").value(2))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(other.toString()))));
        mvc.perform(get("/api/notifications").header("Authorization", "Bearer " + token).param("page", "1").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1));
        for (UUID id : new UUID[]{other, UUID.randomUUID()})
            mvc.perform(post("/api/notifications/{id}/read", id).header("Authorization", "Bearer " + token))
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOTIFICATION_NOT_FOUND"));
        for (int i = 0; i < 2; i++)
            mvc.perform(post("/api/notifications/{id}/read", first).header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(jsonPath("$.readAt").isString());
        var readAt = jdbc.queryForObject("SELECT read_at FROM occurrence_notifications WHERE id = ?", java.sql.Timestamp.class, first);
        mvc.perform(post("/api/notifications/{id}/read", first).header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT read_at FROM occurrence_notifications WHERE id = ?", java.sql.Timestamp.class, first)).isEqualTo(readAt);
        mvc.perform(get("/api/notifications").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.unreadCount").value(1));
        assertThat(jdbc.queryForObject("SELECT read_at FROM occurrence_notifications WHERE id = ?", java.sql.Timestamp.class, second)).isNull();
        for (String path : new String[]{"/api/notifications?page=-1", "/api/notifications?size=101", "/api/notifications?size=no"})
            mvc.perform(get(path).header("Authorization", "Bearer " + token)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mvc.perform(post("/api/notifications/invalid/read").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mvc.perform(get("/api/notifications")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/notifications/{id}/read", first)).andExpect(status().isUnauthorized());
    }

    @Test void revokedOrDisabledIdentityCannotMutateAndAdministrativeRolesAreRejected() throws Exception {
        var author = account(); UUID event = append(author.id());
        var result = login.login(author.email(), PASSWORD);
        UUID session = jdbc.queryForObject("SELECT id FROM auth_sessions WHERE user_id = ?", UUID.class, author.id());
        var identity = new AuthenticatedIdentity(author.id(), session, result.user());
        jdbc.update("UPDATE auth_sessions SET revoked_at = now() WHERE id = ?", session);
        assertThatThrownBy(() -> service.markRead(identity, event)).isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        mvc.perform(get("/api/notifications").header("Authorization", "Bearer " + result.accessToken())).andExpect(status().isUnauthorized());
        var next = login.login(author.email(), PASSWORD);
        UUID nextSession = jdbc.queryForObject("SELECT id FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL", UUID.class, author.id());
        jdbc.update("UPDATE user_accounts SET role = 'ADMIN', status = 'DISABLED' WHERE id = ?", author.id());
        assertThatThrownBy(() -> service.markRead(new AuthenticatedIdentity(author.id(), nextSession, next.user()), event))
                .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        for (String role : new String[]{"ADMIN", "SUPER_ADMIN"}) {
            var admin = account();
            jdbc.update("UPDATE user_accounts SET role = ? WHERE id = ?", role, admin.id());
            String token = login.login(admin.email(), PASSWORD).accessToken();
            mvc.perform(get("/api/notifications").header("Authorization", "Bearer " + token)).andExpect(status().isForbidden());
            mvc.perform(post("/api/notifications/{id}/read", event).header("Authorization", "Bearer " + token)).andExpect(status().isForbidden());
        }
        assertThat(jdbc.queryForObject("SELECT read_at FROM occurrence_notifications WHERE id = ?", java.sql.Timestamp.class, event)).isNull();
    }

    @Test void upgradeMaterializesOldIntentsOnceWithoutDuplicatingV10Notifications() {
        String schema = "notifications_" + UUID.randomUUID().toString().replace("-", "");
        var source = flyway.getConfiguration().getDataSource();
        org.flywaydb.core.Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("9").load().migrate();
        UUID author = UUID.randomUUID(), report = UUID.randomUUID(), event = UUID.randomUUID();
        jdbc.update("INSERT INTO " + schema + ".user_accounts(id,name,email,password_hash,role,created_at,updated_at) VALUES (?, 'Pessoa', 'upgrade@example.com', 'hash', 'USER', now(), now())", author);
        jdbc.update("INSERT INTO " + schema + ".occurrences(id,author_id,category_id,title,neighborhood,reference,image_key,created_at) VALUES (?, ?, 1, 'Poste apagado', 'Centro', 'Praça', 'occurrences/test.png', now())", report, author);
        upgradeEvent(schema, event, report, author, false);
        org.flywaydb.core.Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("10").load().migrate();
        UUID newEvent = UUID.randomUUID();
        upgradeEvent(schema, newEvent, report, author, true);
        var upgraded = org.flywaydb.core.Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".occurrence_notifications", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT message FROM " + schema + ".occurrence_notifications WHERE event_id = ?", String.class, event)).endsWith("Explicação anterior");
        assertThat(upgraded.migrate().migrationsExecuted).isZero();
    }

    private void upgradeEvent(String schema, UUID event, UUID report, UUID author, boolean analyze) {
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(tx -> {
            // Match Flyway's connection search_path so trigger functions resolve this isolated schema.
            jdbc.execute("SET LOCAL search_path TO " + schema);
            jdbc.update("INSERT INTO occurrence_history VALUES (?, ?, 'PENDING', ?, ?, now(), ?, ?)", event, report,
                    analyze ? "IN_ANALYSIS" : "REJECTED", author, analyze ? null : "Explicação anterior", analyze ? 2 : 1);
        });
    }

    private RegistrationResponse account() {
        return registration.register(new RegistrationRequest("Pessoa sintética", UUID.randomUUID() + "@example.com", PASSWORD));
    }
    // Persistence fixture only; command/concurrency/rollback are covered in AdminProvisioningIntegrationTests.
    private UUID append(UUID author) {
        var report = reports.saveAndFlush(new Occurrence(author, categories.findById(1).orElseThrow(), "Poste apagado", null,
                "Centro", "Praça", "occurrences/" + UUID.randomUUID() + ".png", Instant.now()));
        UUID event = UUID.randomUUID();
        jdbc.update("INSERT INTO occurrence_history VALUES (?, ?, 'PENDING', 'REJECTED', ?, now(), 'Explicação do ADMIN', 1)", event, report.getId(), author);
        return event;
    }
}
