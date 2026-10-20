package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.identity.*;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint="})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class OccurrenceFiltersIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired RegistrationService registration;
    @Autowired JdbcTemplate jdbc;
    @Autowired org.springframework.transaction.PlatformTransactionManager manager;
    static final String PASSWORD = "synthetic filters test password";

    @Test void filtersPrecedePagingAndShareCompleteMarkerUniverseWithoutEscapingAuthorization() throws Exception {
        var a = account(); var b = account(); var admin = account(); var superAdmin = account();
        jdbc.update("UPDATE user_accounts SET role = 'ADMIN' WHERE id = ?", admin.id());
        jdbc.update("UPDATE user_accounts SET role = 'SUPER_ADMIN' WHERE id = ?", superAdmin.id());
        String userToken = login(a.email()), adminToken = login(admin.email()), superToken = login(superAdmin.email());
        // Each of 8 categories x 4 states has 128 rows, split evenly across two authors.
        new org.springframework.transaction.support.TransactionTemplate(manager).executeWithoutResult(tx -> {
        jdbc.update("""
                INSERT INTO occurrences(id, author_id, category_id, title, description, neighborhood, reference,
                  status, created_at, version, latitude, longitude)
                SELECT gen_random_uuid(), CASE WHEN (i / 32) % 2 = 0 THEN ?::uuid ELSE ?::uuid END,
                  i % 8 + 1, 'Relato sintético', NULL, 'Centro', 'Praça sintética',
                  (ARRAY['PENDING','IN_ANALYSIS','RESOLVED','REJECTED'])[(i / 8) % 4 + 1],
                  TIMESTAMPTZ '2026-10-01 00:00:00+00' + (i / 2) * INTERVAL '1 second', 0,
                  CASE WHEN i % 17 = 0 THEN NULL ELSE 0 END, CASE WHEN i % 17 = 0 THEN NULL ELSE 0 END
                FROM generate_series(0, 4095) i
                """, a.id(), b.id());
        jdbc.update("INSERT INTO occurrence_media(id,occurrence_id,object_key,kind,position) SELECT gen_random_uuid(), id, 'occurrences/' || gen_random_uuid() || '.png','IMAGE',0 FROM occurrences");
        });
        mvc.perform(get("/api/public/occurrences")).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(3072)).andExpect(jsonPath("$.items.length()").value(20));
        for (int category = 1; category <= 8; category++) {
            mvc.perform(get("/api/public/occurrences").param("categoryId", "" + category)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalItems").value(384));
            for (String state : List.of("PENDING", "IN_ANALYSIS", "RESOLVED")) {
                mvc.perform(get("/api/public/occurrences").param("categoryId", "" + category).param("status", state))
                        .andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(128));
            }
        }
        mvc.perform(get("/api/public/occurrences").param("status", "RESOLVED")).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1024));
        Set<String> pages = new HashSet<>();
        List<String> ordered = new ArrayList<>();
        for (int page = 0; page < 7; page++) {
            var json = mapper.readTree(mvc.perform(get("/api/public/occurrences").param("categoryId", "2").param("status", "IN_ANALYSIS")
                    .param("page", "" + page)).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(jsonPath("$.totalPages").value(7)).andExpect(jsonPath("$.totalItems").value(128))
                    .andExpect(jsonPath("$.items.length()").value(page == 6 ? 8 : 20)).andReturn().getResponse().getContentAsString());
            json.get("items").forEach(item -> { pages.add(item.get("id").asString()); ordered.add(item.get("id").asString()); });
        }
        assertThat(pages).hasSize(128);
        assertThat(ordered).containsExactlyElementsOf(jdbc.queryForList("SELECT id::text FROM occurrences WHERE category_id=2 AND status='IN_ANALYSIS' ORDER BY created_at DESC,id DESC", String.class));
        var markers = mapper.readTree(mvc.perform(get("/api/public/occurrences/markers").param("categoryId", "2").param("status", "IN_ANALYSIS"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(128)).andReturn().getResponse().getContentAsString());
        Set<String> located = new HashSet<>(); markers.get("items").forEach(item -> located.add(item.get("id").asString()));
        assertThat(located.size()).isGreaterThan(50);
        assertThat(markers.get("total").asInt()).isEqualTo(markers.get("located").asInt() + markers.get("unlocated").asInt());
        assertThat(markers.get("unlocated").asInt()).isPositive();
        var legacy = jdbc.queryForList("SELECT id::text FROM occurrences WHERE category_id=2 AND status='IN_ANALYSIS' AND latitude IS NULL", String.class);
        pages.removeAll(legacy); assertThat(located).containsExactlyInAnyOrderElementsOf(pages);
        mvc.perform(get("/api/public/occurrences").param("categoryId", "2").param("status", "IN_ANALYSIS").param("page", "10"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty()).andExpect(jsonPath("$.totalItems").value(128));
        for (String state : List.of("PENDING", "IN_ANALYSIS", "RESOLVED", "REJECTED")) {
            mvc.perform(get("/api/occurrences").header("Authorization", "Bearer " + userToken).param("categoryId", "2")
                    .param("status", state).param("authorId", b.id().toString()))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(64))
                    .andExpect(jsonPath("$[*].id", org.hamcrest.Matchers.containsInAnyOrder(jdbc.queryForList(
                            "SELECT id::text FROM occurrences WHERE author_id=? AND category_id=2 AND status=?", String.class,
                            a.id(), state).toArray(String[]::new))));
            mvc.perform(get("/api/occurrences/markers").header("Authorization", "Bearer " + userToken).param("categoryId", "2").param("status", state))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(64));
            mvc.perform(get("/api/admin/occurrences").header("Authorization", "Bearer " + adminToken).param("scope", "ALL").param("categoryId", "2").param("status", state))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(128));
        }
        mvc.perform(get("/api/occurrences").header("Authorization", "Bearer " + userToken)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2048));
        mvc.perform(get("/api/admin/occurrences").header("Authorization", "Bearer " + adminToken)).andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(2048));
        mvc.perform(get("/api/admin/occurrences").header("Authorization", "Bearer " + adminToken).param("scope", "ALL"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(4096))
                .andExpect(jsonPath("$.items[*].id", org.hamcrest.Matchers.contains(jdbc.queryForList(
                        "SELECT id::text FROM occurrences ORDER BY created_at ASC,id ASC LIMIT 20", String.class).toArray(String[]::new))));
        for (String scope : List.of("QUEUE", "ALL")) {
            for (String token : List.of(userToken, superToken)) mvc.perform(get("/api/admin/occurrences").header("Authorization", "Bearer " + token).param("scope", scope)).andExpect(status().isForbidden());
            for (String state : List.of("RESOLVED", "REJECTED")) if (scope.equals("QUEUE"))
                mvc.perform(get("/api/admin/occurrences").header("Authorization", "Bearer " + adminToken).param("scope", scope).param("status", state)).andExpect(status().isBadRequest());
        }
        var finished = jdbc.queryForObject("SELECT id FROM occurrences WHERE status='RESOLVED' LIMIT 1", UUID.class);
        mvc.perform(post("/api/admin/occurrences/{id}/transitions", finished).header("Authorization", "Bearer " + adminToken)
                .header("If-Match", "\"0\"").contentType("application/json").content("{\"target\":\"IN_ANALYSIS\"}"))
                .andExpect(status().isConflict());
        for (String path : List.of("/api/public/occurrences", "/api/public/occurrences/markers", "/api/occurrences", "/api/occurrences/markers", "/api/admin/occurrences")) {
            for (String[] invalid : new String[][] {{"categoryId","0"},{"categoryId","999"},{"categoryId","abc"},{"categoryId","1.5"},{"categoryId",""}, {"status",""},{"status","pending"},{"status","BAD"},{"scope","BAD"}}) {
                mvc.perform(get(path).header("Authorization", "Bearer " + adminToken).param(invalid[0], invalid[1]))
                        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR")).andExpect(jsonPath("$.fieldErrors." + invalid[0]).isArray());
            }
            for (String key : List.of("categoryId", "status", "scope")) mvc.perform(get(path).header("Authorization", "Bearer " + adminToken).param(key, "1", "2"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors." + key).isArray());
        }
        for (String path : List.of("/api/public/occurrences", "/api/public/occurrences/markers")) mvc.perform(get(path).param("status", "REJECTED")).andExpect(status().isBadRequest());
        var rejected = jdbc.queryForObject("SELECT id FROM occurrences WHERE status='REJECTED' LIMIT 1", UUID.class);
        mvc.perform(get("/api/public/occurrences/{id}", rejected)).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/occurrences/{id}/image", rejected)).andExpect(status().isNotFound());
        String catalog = mvc.perform(get("/api/public/occurrence-categories")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(8))
                .andReturn().getResponse().getContentAsString();
        assertThat(catalog).isEqualTo(mvc.perform(get("/api/occurrence-categories").header("Authorization", "Bearer " + userToken)).andReturn().getResponse().getContentAsString());
        assertThat(mapper.readTree(catalog).get(0).size()).isEqualTo(2);
        mvc.perform(get("/api/public/occurrence-categories/extra")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/public/occurrence-categories")).andExpect(status().isUnauthorized());
        jdbc.update("UPDATE user_accounts SET status='DISABLED' WHERE id=?", admin.id());
        for (String scope : List.of("QUEUE", "ALL")) mvc.perform(get("/api/admin/occurrences").header("Authorization", "Bearer " + adminToken).param("scope", scope)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + userToken).contentType("application/json").content("{}")).andExpect(status().isNoContent());
        mvc.perform(get("/api/occurrences").header("Authorization", "Bearer " + userToken).param("status", "REJECTED")).andExpect(status().isUnauthorized());
        explain(a.id());
        jdbc.update("UPDATE occurrences SET latitude=NULL,longitude=NULL WHERE category_id=2 AND status='IN_ANALYSIS'");
        mvc.perform(get("/api/public/occurrences/markers").param("categoryId", "2").param("status", "IN_ANALYSIS"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(128)).andExpect(jsonPath("$.located").value(0))
                .andExpect(jsonPath("$.unlocated").value(128)).andExpect(jsonPath("$.items").isEmpty());
        jdbc.update("DELETE FROM occurrences WHERE category_id=2 AND status='IN_ANALYSIS'");
        mvc.perform(get("/api/public/occurrences/markers").param("categoryId", "2").param("status", "IN_ANALYSIS"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0)).andExpect(jsonPath("$.located").value(0)).andExpect(jsonPath("$.unlocated").value(0));
        mvc.perform(get("/api/public/occurrences").param("categoryId", "2").param("status", "IN_ANALYSIS"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(0)).andExpect(jsonPath("$.items").isEmpty());
    }
    void explain(UUID author) throws Exception {
        jdbc.execute("ANALYZE occurrences");
        var evidence = new StringBuilder("PostgreSQL 17 descartável; 4096 relatos, oito categorias, quatro estados, dois autores.\n");
        record PlanContext(String predicate, String order, Object[] args) {}
        for (var context : List.of(
                new PlanContext("o.status IN (?, ?, ?)", "DESC", new Object[]{"PENDING", "IN_ANALYSIS", "RESOLVED"}),
                new PlanContext("o.author_id=?", "DESC", new Object[]{author}),
                new PlanContext("o.status IN (?, ?)", "ASC", new Object[]{"PENDING", "IN_ANALYSIS"}),
                new PlanContext("TRUE", "ASC", new Object[]{}))) {
            for (int combination = 0; combination < 4; combination++) {
                var args = new ArrayList<>(Arrays.asList(context.args()));
                String predicate = context.predicate();
                if ((combination & 1) != 0) { predicate += " AND o.category_id=?"; args.add(2); }
                if ((combination & 2) != 0) { predicate += " AND o.status=?"; args.add("IN_ANALYSIS"); }
                String order = " ORDER BY o.created_at " + context.order() + ", o.id " + context.order();
                for (String sql : List.of(
                        "SELECT o.*, c.name FROM occurrences o JOIN occurrence_categories c ON c.id=o.category_id WHERE " + predicate + order + " LIMIT 20 OFFSET 20",
                        "SELECT count(*) FROM occurrences o WHERE " + predicate,
                        "SELECT o.id,o.category_id,c.name,o.title,o.status,o.latitude,o.longitude FROM occurrences o JOIN occurrence_categories c ON c.id=o.category_id WHERE " + predicate + " ORDER BY o.created_at DESC,o.id DESC")) {
                    evidence.append(sql).append('\n');
                    jdbc.queryForList("EXPLAIN (ANALYZE, BUFFERS) " + sql, String.class, args.toArray()).forEach(line -> evidence.append(line).append('\n'));
                }
            }
        }
        Files.writeString(Path.of("target/occurrence-filters-explain.txt"), evidence);
    }
    RegistrationResponse account() { return registration.register(new RegistrationRequest("Pessoa teste", UUID.randomUUID()+"@example.com", PASSWORD)); }
    String login(String email) throws Exception {
        return mapper.readTree(mvc.perform(post("/api/auth/login").contentType("application/json")
                .content(mapper.writeValueAsString(Map.of("email",email,"password",PASSWORD)))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("accessToken").asString();
    }
}
