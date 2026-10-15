package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.identity.*;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.time.Instant;
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
class OccurrenceMarkersIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired RegistrationService registration;
    @Autowired OccurrenceRepository reports;
    @Autowired OccurrenceCategoryRepository categories;
    @Autowired JdbcTemplate jdbc;
    static final String PASSWORD = "synthetic marker test password";

    @Test void completeSetsCountsPrivacyAndVisibilityUseRealSessionsAndPostgres() throws Exception {
        mvc.perform(get("/api/public/occurrences/markers")).andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0)).andExpect(jsonPath("$.items").isEmpty());
        var first = account(); var other = account();
        String firstToken = login(first.email()), otherToken = login(other.email());
        mvc.perform(get("/api/occurrences/markers")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/occurrences/markers").header("Authorization", "Bearer " + firstToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        var zero = report(first.id(), 1, new GeographicPoint(0, 0));
        mvc.perform(get("/api/public/occurrences/markers")).andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.located").value(1))
                .andExpect(jsonPath("$.items[0].latitude").value(0)).andExpect(jsonPath("$.items[0].longitude").value(0));
        for (int i = 0; i < 60; i++) report(first.id(), i % 8 + 1, new GeographicPoint(-23.550520123456, -46.633308987654));
        var legacy = report(first.id(), 8, null);
        var rejected = report(first.id(), 2, new GeographicPoint(10, 20));
        jdbc.update("UPDATE occurrences SET status = 'REJECTED' WHERE id = ?", rejected.getId());
        var resolved = report(other.id(), 3, new GeographicPoint(90, -180));
        jdbc.update("UPDATE occurrences SET status = 'RESOLVED' WHERE id = ?", resolved.getId());
        var analysis = report(other.id(), 7, new GeographicPoint(0, 180));
        jdbc.update("UPDATE occurrences SET status = 'IN_ANALYSIS' WHERE id = ?", analysis.getId());
        String publicBody = mvc.perform(get("/api/public/occurrences/markers")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.total").value(64)).andExpect(jsonPath("$.located").value(63))
                .andExpect(jsonPath("$.unlocated").value(1)).andExpect(jsonPath("$.items.length()").value(63))
                .andReturn().getResponse().getContentAsString();
        assertThat(publicBody).doesNotContain(first.id().toString(), other.id().toString(), first.email(),
                "authorId", "email", "version", "imageKey", "description", "history", rejected.getId().toString(), legacy.getId().toString());
        var json = mapper.readTree(publicBody);
        Set<String> ids = new HashSet<>();
        json.get("items").forEach(item -> ids.add(item.get("id").asString()));
        assertThat(ids).hasSize(63).contains(zero.getId().toString(), resolved.getId().toString(), analysis.getId().toString());
        assertThat(publicBody).contains("-23.550520123456", "-46.633308987654");
        mvc.perform(get("/api/public/occurrences/{id}", rejected.getId())).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/occurrences/{id}/image", rejected.getId())).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/occurrences").param("size", "20")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(20)).andExpect(jsonPath("$.totalItems").value(64));
        String owned = mvc.perform(get("/api/occurrences/markers").param("userId", other.id().toString()).header("Authorization", "Bearer " + firstToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(63))
                .andExpect(jsonPath("$.located").value(62)).andExpect(jsonPath("$.unlocated").value(1))
                .andReturn().getResponse().getContentAsString();
        assertThat(owned).contains(rejected.getId().toString()).doesNotContain(resolved.getId().toString(), analysis.getId().toString());
        mvc.perform(get("/api/occurrences/markers").header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2)).andExpect(jsonPath("$.located").value(2));
        mvc.perform(delete("/api/occurrences/{id}", zero.getId()).header("Authorization", "Bearer " + firstToken).header("If-Match", "\"0\""))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/public/occurrences/markers")).andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(63)).andExpect(jsonPath("$.located").value(62));
        mvc.perform(get("/api/public/occurrences/{id}", zero.getId())).andExpect(status().isNotFound());
        mvc.perform(post("/api/auth/logout").contentType("application/json").content("{}").header("Authorization", "Bearer " + firstToken))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/occurrences/markers").header("Authorization", "Bearer " + firstToken)).andExpect(status().isUnauthorized());
    }
    RegistrationResponse account() {
        return registration.register(new RegistrationRequest("Pessoa teste", UUID.randomUUID() + "@example.com", PASSWORD));
    }
    String login(String email) throws Exception {
        String body = mvc.perform(post("/api/auth/login").contentType("application/json")
                .content(mapper.writeValueAsString(Map.of("email", email, "password", PASSWORD))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(body).get("accessToken").asString();
    }
    Occurrence report(UUID author, int category, GeographicPoint point) {
        var report = new Occurrence(author, categories.findById(category).orElseThrow(), "Relato para mapa", null,
                "Centro", "Praça central", "occurrences/" + UUID.randomUUID() + ".png", Instant.now());
        report.locate(point);
        return reports.saveAndFlush(report);
    }
}
