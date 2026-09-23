package com.project.software.urbanreports.identity;

import com.project.software.urbanreports.support.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint="})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class RegistrationIntegrationTests {
    static final String PATH = "/api/auth/register";
    static final String PASSWORD = "  frase sintética 🔐 com espaços  ";
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper mapper;

    String email() { return UUID.randomUUID() + "@example.com"; }
    String body(String email, String password) {
        return mapper.writeValueAsString(Map.of("name", "  Ána  D'Ávila-Sá  ", "email", email, "password", password));
    }

    @Test void createsCanonicalAccountWithoutAuthenticationOrClientAssignedFields() throws Exception {
        String email = email();
        var tree = mapper.readTree(body("  " + email.toUpperCase(java.util.Locale.ROOT) + "  ", PASSWORD));
        var forged = (tools.jackson.databind.node.ObjectNode) tree;
        forged.put("role", "SUPER_ADMIN");
        forged.put("id", "00000000-0000-0000-0000-000000000000");
        forged.put("password_hash", "client-hash");
        var result = mvc.perform(post(PATH).contentType("application/json").content(mapper.writeValueAsString(tree)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.name").value("Ána  D'Ávila-Sá"))
                .andExpect(jsonPath("$.email").value(email)).andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.password_hash").doesNotExist()).andExpect(jsonPath("$.token").doesNotExist())
                .andExpect(header().doesNotExist("Set-Cookie")).andExpect(header().doesNotExist("Location"))
                .andExpect(header().string("Cache-Control", "no-store")).andReturn();
        assertThat(result.getRequest().getSession(false)).isNull();
        UUID id = UUID.fromString(mapper.readTree(result.getResponse().getContentAsString()).get("id").asString());
        assertThat(id).isNotEqualTo(new UUID(0, 0));
        var row = jdbc.queryForMap("SELECT * FROM user_accounts WHERE id = ?", id);
        assertThat(row.get("created_at")).isNotNull();
        assertThat(row.get("updated_at")).isEqualTo(row.get("created_at"));
        String hash = (String) row.get("password_hash");
        assertThat(hash).startsWith("$argon2id$").isNotEqualTo(PASSWORD);
        assertThat(encoder.matches(PASSWORD, hash)).isTrue();
        assertThat(encoder.matches(PASSWORD.trim(), hash)).isFalse();
        assertThat(mapper.readTree(result.getResponse().getContentAsString()).size()).isEqualTo(4);
        mvc.perform(post(PATH).contentType("application/json").content(body(email, PASSWORD)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMAIL_ALREADY_REGISTERED"));
        mvc.perform(post(PATH).contentType("application/json").content(body(email.replace("@", "+tag@"), PASSWORD)))
                .andExpect(status().isCreated());
    }

    @Test void allForgedPrivilegedRolesRemainUser() throws Exception {
        for (String role : new String[]{"ADMIN", "MODERATOR", "SUPER_ADMIN"}) {
            var payload = (tools.jackson.databind.node.ObjectNode) mapper.readTree(body(email(), PASSWORD));
            payload.put("role", role);
            mvc.perform(post(PATH).contentType("application/json").content(mapper.writeValueAsString(payload)))
                    .andExpect(status().isCreated()).andExpect(jsonPath("$.role").value("USER"));
        }
    }

    @Test void duplicateRaceCommitsExactlyOneRow() throws Exception {
        String email = email();
        var barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Integer> task = () -> {
                barrier.await(10, TimeUnit.SECONDS);
                return mvc.perform(post(PATH).contentType("application/json").content(body(email, PASSWORD)))
                        .andReturn().getResponse().getStatus();
            };
            var first = executor.submit(task);
            var second = executor.submit(task);
            assertThat(java.util.List.of(first.get(30, TimeUnit.SECONDS), second.get(30, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(201, 409);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_accounts WHERE email = ?", Long.class, email)).isEqualTo(1);
    }

    @Test void validatesFieldsMalformedTypesAndBodyLimitWithoutEchoingSecrets() throws Exception {
        for (String payload : new String[]{"{}", "{", "null", "[]", "{} {}", "{\"name\":123}",
                body("invalid", "secret"), body(email(), "🔐".repeat(14)), body(email(), "🔐".repeat(129)),
                body(email(), "a".repeat(9000))}) {
            var result = mvc.perform(post(PATH).contentType("application/json").content(payload))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").isNotEmpty())
                    .andExpect(header().string("Cache-Control", "no-store")).andReturn();
            assertThat(result.getResponse().getContentAsString()).doesNotContain("secret", "rejectedValue", "stackTrace");
        }
        mvc.perform(post(PATH).contentType("application/json").content("{}"))
                .andExpect(jsonPath("$.fieldErrors.name[0]").value("INVALID_NAME"))
                .andExpect(jsonPath("$.fieldErrors.email[0]").value("INVALID_EMAIL"))
                .andExpect(jsonPath("$.fieldErrors.password[0]").value("INVALID_PASSWORD"));
        for (String password : new String[]{"🔐".repeat(15), "🔐".repeat(128), " ".repeat(15)}) {
            mvc.perform(post(PATH).contentType("application/json").content(body(email(), password)))
                    .andExpect(status().isCreated());
        }
    }

    @Test void jsonOnlyAndPublicAccessIsLimitedToExactPost() throws Exception {
        for (String type : new String[]{"text/plain", "application/x-www-form-urlencoded", "multipart/form-data", "application/problem+json"}) {
            mvc.perform(post(PATH).contentType(type).content(body(email(), PASSWORD)))
                    .andExpect(status().isUnsupportedMediaType())
                    .andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"))
                    .andExpect(header().string("Cache-Control", "no-store"));
        }
        mvc.perform(put(PATH).contentType("application/json").content("{}" )).andExpect(status().isUnauthorized());
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        for (String path : new String[]{"/api/auth/register/", "/api/storage/images"}) {
            mvc.perform(post(path).contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        }
        mvc.perform(options(PATH).header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "Content-Type"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
        mvc.perform(post(PATH).header("Origin", "http://localhost:5173").contentType("application/json").content(body(email(), PASSWORD)))
                .andExpect(status().isCreated()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
        mvc.perform(post(PATH).header("Origin", "https://rejected.example.com").contentType("application/json").content(body(email(), PASSWORD)))
                .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test void migrationProtectsInternalWrites() {
        assertThat(jdbc.queryForObject("SELECT success FROM flyway_schema_history WHERE version = '2'", Boolean.class)).isTrue();
        for (String email : new String[]{"UPPER@example.com", " user@example.com", "é@example.com"}) {
            assertThatThrownBy(() -> jdbc.update("INSERT INTO user_accounts VALUES (?, ?, ?, ?, ?, now(), now())",
                    UUID.randomUUID(), "Pessoa", email, "synthetic-hash", "USER"))
                    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        }
    }
}
