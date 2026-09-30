package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.identity.RegistrationResponse;
import com.project.software.urbanreports.identity.RegistrationService;
import com.project.software.urbanreports.identity.RegistrationRequest;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint="})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class OccurrenceQueryIntegrationTests {
    private static final String PASSWORD = "synthetic password for tests";
    private static final Instant NOW = Instant.parse("2026-09-28T12:00:00Z");

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
    void listsOnlyAuthenticatedAuthorsAndHidesOtherDetails() throws Exception {
        var first = account();
        var second = account();
        var firstOccurrence = occurrence(first, "Calçada quebrada na praça");
        occurrence(second, "Lixo acumulado na esquina");
        String firstToken = token(first);
        String secondToken = token(second);

        mvc.perform(get("/api/occurrences").header("Authorization", "Bearer " + firstToken)
                        .param("userId", second.id().toString()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(firstOccurrence.getId().toString()))
                .andExpect(jsonPath("$[0].title").value("Calçada quebrada na praça"))
                .andExpect(jsonPath("$[0].status").value("PENDING"))
                .andExpect(jsonPath("$[0].categoryName").value("Iluminação pública"))
                .andExpect(jsonPath("$[0].neighborhood").value("Centro"))
                .andExpect(jsonPath("$[0].reference").value("Praça central"));

        mvc.perform(get("/api/occurrences/{id}", firstOccurrence.getId())
                        .header("Authorization", "Bearer " + secondToken))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/occurrences/{id}", firstOccurrence.getId())
                        .header("Authorization", "Bearer " + firstToken))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.description").value("A calçada está quebrada e dificulta a passagem."));
    }

    @Test
    void returnsEmptyListForAuthenticatedCitizenWithoutOccurrencesAndRequiresSession() throws Exception {
        var user = account();
        mvc.perform(get("/api/occurrences").header("Authorization", "Bearer " + token(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
        mvc.perform(get("/api/occurrences")).andExpect(status().isUnauthorized());
    }

    @Test
    void missingDetailAndForeignDetailHaveSamePublicErrorAndAnonymousDetailRequiresSession() throws Exception {
        var owner = account();
        var other = account();
        var report = occurrence(owner, "Calçada quebrada na praça");
        String otherToken = token(other);
        for (UUID id : java.util.List.of(report.getId(), UUID.randomUUID())) {
            mvc.perform(get("/api/occurrences/{id}", id).header("Authorization", "Bearer " + otherToken))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("OCCURRENCE_NOT_FOUND"))
                    .andExpect(jsonPath("$.title").doesNotExist())
                    .andExpect(jsonPath("$.imageKey").doesNotExist());
        }
        mvc.perform(get("/api/occurrences/{id}", report.getId())).andExpect(status().isUnauthorized());
    }

    @Test
    void listUsesDeterministicDescendingOrderAndDoesNotExposeStorage() throws Exception {
        var user = account();
        var first = occurrence(user, "Primeira ocorrência da conta");
        var second = occurrence(user, "Segunda ocorrência da conta");
        var expected = java.util.stream.Stream.of(first, second)
                .sorted(java.util.Comparator.comparing((Occurrence value) -> value.getId().toString()).reversed()).toList();
        mvc.perform(get("/api/occurrences").header("Authorization", "Bearer " + token(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(expected.get(0).getId().toString()))
                .andExpect(jsonPath("$[1].id").value(expected.get(1).getId().toString()))
                .andExpect(jsonPath("$[0].imageKey").doesNotExist())
                .andExpect(jsonPath("$[0].authorId").doesNotExist());
    }

    private RegistrationResponse account() {
        return registration.register(new RegistrationRequest(
                "Pessoa sintética", UUID.randomUUID() + "@example.com", PASSWORD));
    }

    private String token(RegistrationResponse user) throws Exception {
        var response = mvc.perform(post("/api/auth/login").contentType("application/json")
                        .content(mapper.writeValueAsString(java.util.Map.of(
                                "email", user.email(), "password", PASSWORD))))
                .andExpect(status().isOk()).andReturn();
        return mapper.readTree(response.getResponse().getContentAsString()).get("accessToken").asString();
    }

    private Occurrence occurrence(RegistrationResponse author, String title) {
        var category = categories.findById(1).orElseThrow();
        return occurrences.saveAndFlush(new Occurrence(author.id(), category, title,
                "A calçada está quebrada e dificulta a passagem.", "Centro", "Praça central",
                "occurrences/" + UUID.randomUUID() + ".png", NOW));
    }
}
