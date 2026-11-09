package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.auth.LoginService;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint=", "image.recovery.enabled=false"})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class LegacyOccurrenceHistoryHttpTests {
    @TestBean(methodName = "legacyPostgres") PostgreSQLContainer postgresContainer;
    static PostgreSQLContainer legacyPostgres() { return LegacyDatabase.postgresContainer(); }
    static final UUID OWNER = UUID.randomUUID(), ADMIN = UUID.randomUUID(), STRANGER = UUID.randomUUID();
    static final List<UUID> REPORTS = List.of(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
    static final String PASSWORD = "synthetic legacy history password";
    static List<Map<String, Object>> originalHistory;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired LoginService login;
    @Autowired PasswordEncoder passwords;
    @Autowired Flyway flyway;

    @Test void v15ToV16KeepsEventsIntactAndBothAuthorizedDetailsReadable() throws Exception {
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("16");
        jdbc.update("UPDATE user_accounts SET password_hash=?", passwords.encode(PASSWORD));
        String ownerToken = login.login("owner@example.com", PASSWORD).accessToken();
        String adminToken = login.login("admin@example.com", PASSWORD).accessToken();
        String strangerToken = login.login("stranger@example.com", PASSWORD).accessToken();
        var statuses = List.of("ACCEPTED", "RESOLVED", "REJECTED");
        for (int i = 0; i < REPORTS.size(); i++) {
            UUID id = REPORTS.get(i);
            JsonNode owner = detail("/api/occurrences/", id, ownerToken);
            JsonNode admin = detail("/api/admin/occurrences/", id, adminToken);
            assertThat(owner.get("status").asString()).isEqualTo(statuses.get(i));
            assertThat(admin.get("report").get("status").asString()).isEqualTo(statuses.get(i));
            var persisted = originalHistory.stream().filter(row -> row.get("occurrence_id").equals(id)).toList();
            for (var surface : List.of(owner, admin)) {
                var events = surface.get("history");
                assertThat(events.size()).isEqualTo(persisted.size());
                for (int n = 0; n < persisted.size(); n++) {
                    var row = persisted.get(n); var event = events.get(n);
                    assertThat(event.get("id").asString()).isEqualTo(row.get("id").toString());
                    for (String field : List.of("previous", "new")) {
                        String raw = row.get(field + "_status").toString();
                        assertThat(event.get(field + "Status").asString()).isEqualTo(raw.equals("IN_ANALYSIS") ? "ACCEPTED" : raw);
                    }
                    assertThat(Instant.parse(event.get("occurredAt").asString()))
                            .isEqualTo(((java.sql.Timestamp) row.get("occurred_at")).toInstant());
                    assertThat(event.get("reason")).isEqualTo(mapper.valueToTree(row.get("reason")));
                    assertThat(event.get("responsible").asString()).isEqualTo(surface == owner ? "Moderação" : "Admin legado");
                    assertThat(event.has("moderatorId")).isFalse();
                    assertThat(event.has("email")).isFalse();
                }
            }
            mvc.perform(get("/api/occurrences/{id}", id).header("Authorization", "Bearer " + strangerToken))
                    .andExpect(status().isNotFound());
            mvc.perform(get("/api/occurrences/{id}", id).header("Authorization", "Bearer " + adminToken))
                    .andExpect(status().isNotFound());
            mvc.perform(get("/api/admin/occurrences/{id}", id).header("Authorization", "Bearer " + ownerToken))
                    .andExpect(status().isForbidden());
        }
        assertThat(jdbc.queryForList("SELECT * FROM occurrence_history ORDER BY occurrence_id, occurred_at, version"))
                .isEqualTo(originalHistory);
    }

    private JsonNode detail(String path, UUID id, String token) throws Exception {
        return mapper.readTree(mvc.perform(get(path + id).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    static class LegacyDatabase {
        static PostgreSQLContainer postgresContainer() {
            var container = new PostgreSQLContainer(org.testcontainers.utility.DockerImageName.parse("postgres:17-alpine"));
            container.start();
            var source = new DriverManagerDataSource(container.getJdbcUrl(), container.getUsername(), container.getPassword());
            Flyway.configure().dataSource(source).target("15").load().migrate();
            var fixtures = new JdbcTemplate(source);
            for (var account : List.of(new Object[]{OWNER, "Pessoa dona", "owner@example.com", "USER"},
                    new Object[]{ADMIN, "Admin legado", "admin@example.com", "ADMIN"},
                    new Object[]{STRANGER, "Outra pessoa", "stranger@example.com", "USER"})) {
                fixtures.update("INSERT INTO user_accounts(id,name,email,role,password_hash,created_at,updated_at) VALUES (?,?,?,?, 'synthetic-hash',now(),now())", account);
            }
            new TransactionTemplate(new DataSourceTransactionManager(source)).executeWithoutResult(tx -> {
                for (int i = 0; i < REPORTS.size(); i++) {
                    UUID id = REPORTS.get(i);
                    String current = List.of("IN_ANALYSIS", "RESOLVED", "REJECTED").get(i);
                    fixtures.update("INSERT INTO occurrences(id,author_id,category_id,title,neighborhood,reference,status,version,created_at) VALUES (?,?,1,'Relato legado','Centro','Praça sintética',?,?,?)",
                            id, OWNER, current, i == 0 ? 1 : 2, java.sql.Timestamp.from(Instant.parse("2026-10-01T10:00:00Z")));
                    fixtures.update("INSERT INTO occurrence_media(id,occurrence_id,object_key,kind,position) VALUES (?,?,?,'IMAGE',0)", UUID.randomUUID(), id, "occurrences/" + id + ".png");
                    append(fixtures, id, "PENDING", "IN_ANALYSIS", null, 1);
                    // Same instant intentionally checks the version tie-break in both readers.
                    if (i > 0) append(fixtures, id, "IN_ANALYSIS", current, i == 2 ? "Justificativa antiga preservada" : null, 2);
                }
            });
            originalHistory = fixtures.queryForList("SELECT * FROM occurrence_history ORDER BY occurrence_id, occurred_at, version");
            // Spring Boot applies V16 to this populated V15 database before HTTP requests.
            return container;
        }

        private static void append(JdbcTemplate fixtures, UUID id, String previous, String next, String reason, long version) {
            fixtures.update("INSERT INTO occurrence_history(id,occurrence_id,previous_status,new_status,moderator_id,occurred_at,reason,version) VALUES (?,?,?,?,?,?,?,?)",
                    UUID.randomUUID(), id, previous, next, ADMIN, java.sql.Timestamp.from(Instant.parse("2026-10-01T12:00:00Z")), reason, version);
        }
    }
}
