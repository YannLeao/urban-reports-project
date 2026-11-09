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
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.junit.jupiter.api.BeforeEach;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint="})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class SimilarOccurrenceIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired RegistrationService registration;
    @Autowired OccurrenceRepository reports;
    @Autowired OccurrenceCategoryRepository categories;
    @Autowired JdbcTemplate jdbc;
    @Autowired org.springframework.transaction.PlatformTransactionManager manager;
    @MockitoSpyBean SimilarOccurrenceService service;
    @MockitoSpyBean com.project.software.urbanreports.storage.application.ImageStorageService storage;
    static final String PASSWORD = "synthetic similar test password";
    static final String ENDPOINT = "/api/occurrences/similar";
    static final String ZERO = "{\"categoryId\":1,\"latitude\":0,\"longitude\":0}";

    @BeforeEach void cleanDisposableReports() { jdbc.execute("DELETE FROM occurrences"); }

    @Test void onlyExistenceIsExposedAndEditingExcludesOnlyOwnedReports() throws Exception {
        var owner = account(); var other = account(); String token = login(other.email());
        var candidate = report(owner.id(), 1, 0., 0.);
        assertThat(search(token, ZERO)).isTrue();
        mvc.perform(get("/api/occurrences/{id}", candidate.getId()).header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("OCCURRENCE_NOT_FOUND"));
        assertThat(search(token, "{\"categoryId\":2,\"latitude\":0,\"longitude\":0}")).isFalse();
        for (String role : List.of("USER", "ADMIN")) {
            jdbc.update("UPDATE user_accounts SET role=? WHERE id=?", role, other.id());
            assertThat(search(token, ZERO)).isTrue();
        }
        String ownerToken = login(owner.email());
        String exclusion = "{\"categoryId\":1,\"latitude\":0,\"longitude\":0,\"excludeOccurrenceId\":\"" + candidate.getId() + "\"}";
        assertThat(search(ownerToken, exclusion)).isFalse();
        report(other.id(), 1, 0., 0.);
        assertThat(search(ownerToken, exclusion)).isTrue();
        for (var id : List.of(owner.id(), UUID.randomUUID(), candidate.getId())) {
            mvc.perform(post(ENDPOINT).header("Authorization", "Bearer " + token).contentType("application/json")
                    .content("{\"categoryId\":1,\"latitude\":0,\"longitude\":0,\"excludeOccurrenceId\":\"" + id + "\"}"))
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("OCCURRENCE_NOT_FOUND"));
        }
    }

    @Test void geographyAndOpenStateEligibilityKeepInclusiveRadiusWithoutRounding() throws Exception {
        var user = account(); String token = login(user.email());
        report(user.id(), 2, 0., 0.); report(user.id(), 1, null, null);
        var rejected = report(user.id(), 1, 0., 0.);
        var resolved = report(user.id(), 1, 0., 0.);
        jdbc.update("UPDATE occurrences SET status='REJECTED' WHERE id=?", rejected.getId());
        jdbc.update("UPDATE occurrences SET status='RESOLVED' WHERE id=?", resolved.getId());
        report(user.id(), 1, Math.toDegrees(100.000001 / SimilarOccurrenceService.EARTH_RADIUS_METERS), 0.);
        assertThat(search(token, ZERO)).isFalse();
        var boundary = report(user.id(), 1, Math.toDegrees(100 / SimilarOccurrenceService.EARTH_RADIUS_METERS), 0.);
        assertThat(search(token, ZERO)).isTrue();
        jdbc.update("UPDATE occurrences SET status='ACCEPTED' WHERE id=?", boundary.getId());
        assertThat(search(token, ZERO)).isTrue();
        jdbc.update("UPDATE occurrences SET status='RESOLVED' WHERE id=?", boundary.getId());
        assertThat(search(token, ZERO)).isFalse();
        report(user.id(), 1, Math.toDegrees(-99.999999 / SimilarOccurrenceService.EARTH_RADIUS_METERS), 0.);
        assertThat(search(token, ZERO)).isTrue();
    }

    @Test void polesAntimeridianSignsAndAxes() throws Exception {
        var user=account(); String token=login(user.email());
        report(user.id(),1,90.,180.); report(user.id(),1,90.,-60.);
        assertThat(search(token,"{\"categoryId\":1,\"latitude\":90,\"longitude\":0}")).isTrue();
        report(user.id(),2,0.,-179.9999);
        assertThat(search(token,"{\"categoryId\":2,\"latitude\":0,\"longitude\":179.9999}")).isTrue();
        report(user.id(),3,-8.336,-36.424); report(user.id(),3,8.336,36.424);
        assertThat(search(token,"{\"categoryId\":3,\"latitude\":-8.336,\"longitude\":-36.424}")).isTrue();
        search(token,"{\"categoryId\":8,\"latitude\":-90,\"longitude\":-180}");
    }

    @Test void strictBoundedJsonAndSessionRolePolicy() throws Exception {
        var user=account(); String token=login(user.email());
        mvc.perform(post(ENDPOINT).contentType("application/json").content(ZERO)).andExpect(status().isUnauthorized()).andExpect(header().string("Cache-Control","no-store"));
        for (String body : List.of("", "null", "[]", "{}", ZERO+"{}", ZERO.replace("0}","181}"), ZERO.replace("latitude\":0", "latitude\":91"),
                ZERO.replace("latitude\":0", "latitude\":\"0\""), ZERO.replace("latitude\":0", "latitude\":null"), ZERO.replace("latitude\":0,", ""),
                ZERO.replace("latitude\":0", "latitude\":NaN"), ZERO.replace("latitude\":0", "latitude\":Infinity"), ZERO.replace("latitude\":0", "latitude\":1e9999"),
                ZERO.replace("categoryId\":1", "categoryId\":999"), ZERO.replace("categoryId\":1", "categoryId\":1.0"),
                ZERO.replace("}",",\"radius\":100}"), ZERO.replace("}",",\"excludeOccurrenceId\":\"invalid\"}"), ZERO.replace("}",",\"latitude\":1}"),
                ZERO+" ".repeat(8192))) {
            mvc.perform(post(ENDPOINT).header("Authorization","Bearer "+token).contentType("application/json").content(body))
                    .andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control","no-store"))
                    .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }
        mvc.perform(post(ENDPOINT+"?radius=200").header("Authorization","Bearer "+token).contentType("application/json").content(ZERO)).andExpect(status().isBadRequest());
        for (String role: List.of("ADMIN","SUPER_ADMIN")) {
            jdbc.update("UPDATE user_accounts SET role=? WHERE id=?",role,user.id());
            var expected = role.equals("ADMIN") ? status().isOk() : status().isForbidden();
            mvc.perform(post(ENDPOINT).header("Authorization","Bearer "+token).contentType("application/json").content(ZERO)).andExpect(expected);
        }
        jdbc.update("UPDATE user_accounts SET role='USER' WHERE id=?",user.id());
        mvc.perform(post("/api/auth/logout").header("Authorization","Bearer "+token).contentType("application/json").content("{}" )).andExpect(status().isNoContent());
        mvc.perform(post(ENDPOINT).header("Authorization","Bearer "+token).contentType("application/json").content(ZERO)).andExpect(status().isUnauthorized());
    }

    @Test void bodyIsBoundedWithoutContentLength() throws Exception {
        var request = new org.springframework.mock.web.MockHttpServletRequest() {
            @Override public int getContentLength() { return -1; }
            @Override public long getContentLengthLong() { return -1; }
        };
        request.setContentType("application/json");
        request.setContent((ZERO + " ".repeat(8192)).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> SimilarOccurrenceRequest.read(request)).isInstanceOf(IllegalArgumentException.class);
        request.setContent(ZERO.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(SimilarOccurrenceRequest.read(request).latitude()).isZero();
    }

    @Test void persistenceFailureIsSanitizedAndNeverAnEmptySuccess() throws Exception {
        String token=login(account().email());
        doThrow(new org.springframework.dao.DataAccessResourceFailureException("private synthetic detail")).when(service).read(any(),any());
        String body=mvc.perform(post(ENDPOINT).header("Authorization","Bearer "+token).contentType("application/json").content(ZERO))
                .andExpect(status().isServiceUnavailable()).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(jsonPath("$.code").value("SIMILAR_OCCURRENCES_UNAVAILABLE")).andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("private synthetic detail","items");
    }

    @Test void lookupDoesNotWriteOrAccessStorageAndExpiredOrDisabledSessionsFail() throws Exception {
        var user = account(); String token = login(user.email());
        report(user.id(), 1, 0., 0.);
        var tables = List.of("occurrences", "occurrence_history", "occurrence_notifications", "image_upload_journal");
        var counts = tables.stream().map(table -> jdbc.queryForObject("SELECT count(*) FROM " + table, Long.class)).toList();
        org.mockito.Mockito.clearInvocations(storage);
        search(token, ZERO);
        org.mockito.Mockito.verifyNoInteractions(storage);
        assertThat(tables.stream().map(table -> jdbc.queryForObject("SELECT count(*) FROM " + table, Long.class)).toList()).isEqualTo(counts);
        jdbc.update("UPDATE auth_sessions SET created_at = created_at - interval '2 hours', expires_at = expires_at - interval '2 hours' WHERE user_id = ?", user.id());
        mvc.perform(post(ENDPOINT).header("Authorization", "Bearer " + token).contentType("application/json").content(ZERO))
                .andExpect(status().isUnauthorized()).andExpect(header().string("Cache-Control", "no-store"));
        var disabled = account(); String otherToken = login(disabled.email());
        jdbc.update("UPDATE user_accounts SET role='ADMIN', status='DISABLED' WHERE id=?", disabled.id());
        mvc.perform(post(ENDPOINT).header("Authorization", "Bearer " + otherToken).contentType("application/json").content(ZERO))
                .andExpect(status().isUnauthorized());
    }

    @Test void representativeDisposablePlan() throws Exception {
        var user=account();
        new org.springframework.transaction.support.TransactionTemplate(manager).executeWithoutResult(tx -> {
        jdbc.update("""
            INSERT INTO occurrences(id,author_id,category_id,title,description,neighborhood,reference,status,created_at,version,latitude,longitude)
            SELECT gen_random_uuid(), ?, (n % 8)+1, 'Synthetic plan', null, 'Centro', 'Synthetic reference',
                CASE WHEN n % 3=0 THEN 'RESOLVED' ELSE 'PENDING' END, now(), 0,
                -8.336 + (n % 1000)*0.00001, -36.424 FROM generate_series(1,20000) n
            """,user.id());
        jdbc.update("""
            INSERT INTO occurrence_media(id,occurrence_id,object_key,kind,content_type,position)
            SELECT gen_random_uuid(),id,'occurrences/' || id || '.png','IMAGE','image/png',0 FROM occurrences
            """);
        });
        jdbc.execute("ANALYZE occurrences");
        var plan=jdbc.queryForList("EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) "+SimilarOccurrenceService.SQL,String.class,-8.336,-8.336,-36.424,1,null,null);
        java.nio.file.Files.write(java.nio.file.Path.of("target/similar-query-plan.txt"),plan);
        assertThat(plan).anyMatch(line -> line.contains("Execution Time"));
    }
    boolean search(String token, String body) throws Exception {
        String response = mvc.perform(post(ENDPOINT).header("Authorization", "Bearer " + token).contentType("application/json").content(body))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsString();
        // Assert the complete HTTP body: no candidate list, identifiers, metadata or count.
        assertThat(response).isIn("{\"hasSimilar\":true}", "{\"hasSimilar\":false}");
        return mapper.readTree(response).get("hasSimilar").asBoolean();
    }
    RegistrationResponse account() { return registration.register(new RegistrationRequest("Pessoa teste",UUID.randomUUID()+"@example.com",PASSWORD)); }
    String login(String email) throws Exception {
        return mapper.readTree(mvc.perform(post("/api/auth/login").contentType("application/json").content(mapper.writeValueAsString(Map.of("email",email,"password",PASSWORD))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("accessToken").asString();
    }
    Occurrence report(UUID author,int category,Double latitude,Double longitude) {
        var item=new Occurrence(author,categories.findById(category).orElseThrow(),"Relato sintético",null,"Centro","Praça central","occurrences/"+UUID.randomUUID()+".png",Instant.now());
        if(latitude!=null) item.locate(new GeographicPoint(latitude,longitude));
        return reports.saveAndFlush(item);
    }
}
