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

    @Test void geographyEligibilityOrderingExclusionAndPublicRevalidation() throws Exception {
        var owner = account(); var other = account(); String token = login(owner.email());
        var own = report(owner.id(), 1, 0., 0.);
        var analysis = report(other.id(), 1, 0., 0.);
        jdbc.update("UPDATE occurrences SET status='IN_ANALYSIS' WHERE id=?", analysis.getId());
        var rejected = report(owner.id(), 1, 0., 0.);
        jdbc.update("UPDATE occurrences SET status='REJECTED' WHERE id=?", rejected.getId());
        var resolved = report(other.id(), 1, 0., 0.);
        jdbc.update("UPDATE occurrences SET status='RESOLVED' WHERE id=?", resolved.getId());
        report(other.id(), 2, 0., 0.); report(other.id(), 1, null, null);
        double edge = Math.toDegrees(100 / SimilarOccurrenceService.EARTH_RADIUS_METERS);
        var boundary = report(other.id(), 1, edge, 0.);
        var outside = report(other.id(), 1, Math.toDegrees(100.000001 / SimilarOccurrenceService.EARTH_RADIUS_METERS), 0.);
        var inside = report(other.id(), 1, -edge * .999999, 0.);
        var result = search(token, ZERO);
        assertThat(result.get("items").size()).isEqualTo(4);
        assertThat(result.toString()).contains(own.getId().toString(), analysis.getId().toString(), boundary.getId().toString(), inside.getId().toString())
                .doesNotContain(rejected.getId().toString(), resolved.getId().toString(), outside.getId().toString(), owner.id().toString(), other.id().toString(),
                        "author", "version", "latitude", "longitude", "description", "media", "image", "history", "bucket", "key");
        assertThat(result.get("items").get(0).get("distanceMeters").asDouble()).isZero();
        assertThat(result.get("items").get(3).get("distanceMeters").asDouble()).isLessThanOrEqualTo(100);
        for (int i=0; i<7; i++) report(other.id(), 1, 0., 0.);
        jdbc.update("UPDATE occurrences SET created_at = ? WHERE status='PENDING'", java.sql.Timestamp.from(Instant.parse("2026-01-01T00:00:00Z")));
        var excluded = search(token, "{\"categoryId\":1,\"latitude\":0,\"longitude\":0,\"excludeOccurrenceId\":\"" + own.getId() + "\"}");
        var expected = jdbc.queryForList("SELECT id::text FROM occurrences WHERE category_id=1 AND status IN ('PENDING','IN_ANALYSIS') AND latitude=0 AND longitude=0 AND id<>? ORDER BY created_at DESC,id DESC LIMIT 5", String.class, own.getId());
        var ids = new ArrayList<String>(); excluded.get("items").forEach(item -> ids.add(item.get("id").asString()));
        assertThat(ids).containsExactlyElementsOf(expected);
        assertThat(search(token, "{\"categoryId\":2,\"latitude\":30,\"longitude\":40,\"excludeOccurrenceId\":\"" + own.getId() + "\"}").get("items").size()).isZero();
        for (var id : List.of(other.id(), UUID.randomUUID(), analysis.getId())) {
            mvc.perform(post(ENDPOINT).header("Authorization", "Bearer " + token).contentType("application/json")
                .content("{\"categoryId\":1,\"latitude\":0,\"longitude\":0,\"excludeOccurrenceId\":\""+id+"\"}"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("OCCURRENCE_NOT_FOUND")).andExpect(header().string("Cache-Control", "no-store"));
        }
        jdbc.update("UPDATE occurrences SET status='REJECTED' WHERE id=?", analysis.getId());
        mvc.perform(get("/api/public/occurrences/{id}", analysis.getId())).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/occurrences/{id}/image", analysis.getId())).andExpect(status().isNotFound());
        mvc.perform(delete("/api/occurrences/{id}", own.getId()).header("Authorization", "Bearer "+token).header("If-Match", "\"0\""))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/public/occurrences/{id}", own.getId())).andExpect(status().isNotFound());
    }

    @Test void polesAntimeridianSignsAndAxes() throws Exception {
        var user=account(); String token=login(user.email());
        report(user.id(),1,90.,180.); report(user.id(),1,90.,-60.);
        assertThat(search(token,"{\"categoryId\":1,\"latitude\":90,\"longitude\":0}").get("items").size()).isEqualTo(2);
        report(user.id(),2,0.,-179.9999);
        assertThat(search(token,"{\"categoryId\":2,\"latitude\":0,\"longitude\":179.9999}").get("items").size()).isEqualTo(1);
        report(user.id(),3,-8.336,-36.424); report(user.id(),3,8.336,36.424);
        assertThat(search(token,"{\"categoryId\":3,\"latitude\":-8.336,\"longitude\":-36.424}").get("items").size()).isEqualTo(1);
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
            mvc.perform(post(ENDPOINT).header("Authorization","Bearer "+token).contentType("application/json").content(ZERO)).andExpect(status().isForbidden());
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
    tools.jackson.databind.JsonNode search(String token,String body) throws Exception {
        return mapper.readTree(mvc.perform(post(ENDPOINT).header("Authorization","Bearer "+token).contentType("application/json").content(body))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(jsonPath("$.radiusMeters").value(100)).andExpect(jsonPath("$.limit").value(5)).andReturn().getResponse().getContentAsString());
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
