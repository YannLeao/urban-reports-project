package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.identity.RegistrationRequest;
import com.project.software.urbanreports.identity.RegistrationResponse;
import com.project.software.urbanreports.identity.RegistrationService;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint="})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PublicOccurrenceIntegrationTests {
    private static final String PASSWORD = "synthetic password for tests";
    private static final Instant NOW = Instant.parse("2026-09-28T12:00:00Z");
    // Datas futuras: as ocorrências destes testes ficam sempre no topo da lista pública.
    private static final Instant FUTURE = Instant.parse("2099-01-01T00:00:00Z");

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired RegistrationService registration;
    @Autowired OccurrenceRepository occurrences;
    @Autowired OccurrenceCategoryRepository categories;
    @MockitoBean Clock clock;

    @BeforeEach
    void time() {
        when(clock.instant()).thenReturn(NOW);
    }

    @Test
    void anonymousVisitorSeesOccurrencesOfAnyAuthorWithoutPrivateData() throws Exception {
        var firstAuthor = account();
        var secondAuthor = account();
        var first = occurrence(firstAuthor, "Calçada quebrada na praça", FUTURE.plusSeconds(10));
        var second = occurrence(secondAuthor, "Lixo acumulado na esquina", FUTURE.plusSeconds(20));

        String list = body(mvc.perform(get("/api/public/occurrences").param("size", "50"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store")));
        assertThat(ids(list)).contains(first.getId().toString(), second.getId().toString());
        assertNoPrivateData(list, firstAuthor, first);
        assertNoPrivateData(list, secondAuthor, second);

        String detail = body(mvc.perform(get("/api/public/occurrences/{id}", first.getId()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.id").value(first.getId().toString()))
                .andExpect(jsonPath("$.title").value("Calçada quebrada na praça"))
                .andExpect(jsonPath("$.categoryName").value("Iluminação pública"))
                .andExpect(jsonPath("$.neighborhood").value("Centro"))
                .andExpect(jsonPath("$.reference").value("Praça central"))
                .andExpect(jsonPath("$.status").value("PENDING")));
        assertNoPrivateData(detail, firstAuthor, first);
    }

    @Test
    void listIsNewestFirstWithDeterministicTieBreak() throws Exception {
        var author = account();
        var older = occurrence(author, "Ocorrência mais antiga", FUTURE.plusSeconds(100));
        var newer = occurrence(author, "Ocorrência mais recente", FUTURE.plusSeconds(200));
        var tieA = occurrence(author, "Empate número um", FUTURE.plusSeconds(50));
        var tieB = occurrence(author, "Empate número dois", FUTURE.plusSeconds(50));

        List<String> ids = ids(body(mvc.perform(get("/api/public/occurrences").param("size", "50"))
                .andExpect(status().isOk())));
        var tied = Stream.of(tieA, tieB).map(o -> o.getId().toString())
                .sorted(Comparator.reverseOrder()).toList();
        assertThat(ids).contains(newer.getId().toString(), older.getId().toString(), tied.get(0), tied.get(1));
        assertThat(ids.indexOf(newer.getId().toString())).isLessThan(ids.indexOf(older.getId().toString()));
        assertThat(ids.indexOf(older.getId().toString())).isLessThan(ids.indexOf(tied.get(0)));
        assertThat(ids.indexOf(tied.get(0))).isLessThan(ids.indexOf(tied.get(1)));
    }

    @Test
    void pageMetadataFollowsTheContract() throws Exception {
        var author = account();
        for (int i = 0; i < 3; i++) {
            occurrence(author, "Ocorrência de paginação " + i, FUTURE.plusSeconds(300 + i));
        }
        mvc.perform(get("/api/public/occurrences").param("page", "0").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.items", org.hamcrest.Matchers.hasSize(2)))
                .andExpect(jsonPath("$.totalItems").isNumber())
                .andExpect(jsonPath("$.totalPages").isNumber());
        mvc.perform(get("/api/public/occurrences"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(20));
    }

    @Test
    void invalidPagingAndIdentifiersAreRejectedWithTheStandardError() throws Exception {
        String[][] invalid = {{"page", "-1"}, {"size", "0"}, {"size", "51"}, {"page", "abc"}, {"size", "abc"}};
        for (String[] parameter : invalid) {
            mvc.perform(get("/api/public/occurrences").param(parameter[0], parameter[1]))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
        mvc.perform(get("/api/public/occurrences/{id}", "not-a-uuid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void missingOccurrenceReturnsNotFoundWithoutRequiringLogin() throws Exception {
        UUID missing = UUID.randomUUID();
        for (String path : List.of("/api/public/occurrences/{id}", "/api/public/occurrences/{id}/image")) {
            mvc.perform(get(path, missing))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("OCCURRENCE_NOT_FOUND"));
        }
    }

    @Test
    void privateRoutesStillRequireLoginAndPublicPathsAreReadOnly() throws Exception {
        var author = account();
        var report = occurrence(author, "Calçada quebrada na praça", FUTURE.plusSeconds(400));
        mvc.perform(get("/api/occurrences")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/occurrences/{id}", report.getId())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/occurrences/{id}/image", report.getId())).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/public/occurrences")).andExpect(status().is4xxClientError());
        mvc.perform(delete("/api/public/occurrences/{id}", report.getId())).andExpect(status().is4xxClientError());
    }

    private void assertNoPrivateData(String json, RegistrationResponse author, Occurrence occurrence) {
        assertThat(json).doesNotContain(author.id().toString(), author.email(), occurrence.getImageKey(),
                "authorId", "imageKey", "version");
    }

    private String body(ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private List<String> ids(String json) {
        List<String> ids = new ArrayList<>();
        for (var item : mapper.readTree(json).get("items")) {
            ids.add(item.get("id").asString());
        }
        return ids;
    }

    private RegistrationResponse account() {
        return registration.register(new RegistrationRequest(
                "Pessoa sintética", UUID.randomUUID() + "@example.com", PASSWORD));
    }

    private Occurrence occurrence(RegistrationResponse author, String title, Instant createdAt) {
        var category = categories.findById(1).orElseThrow();
        return occurrences.saveAndFlush(new Occurrence(author.id(), category, title,
                "A calçada está quebrada e dificulta a passagem.", "Centro", "Praça central",
                "occurrences/" + UUID.randomUUID() + ".png", createdAt));
    }
}