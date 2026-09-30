package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.storage.application.*;
import com.project.software.urbanreports.support.ImageFixtures;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.config.import=", "spring.profiles.active=", "image.storage.endpoint="})
@Import({TestcontainersConfiguration.class, OccurrenceHttpTests.StorageConfiguration.class})
class OccurrenceHttpTests {
    static final Instant NOW = Instant.parse("2026-09-30T12:00:00Z");
    static final int LIMIT = 5 * 1024 * 1024;
    static final String BOUNDARY = "occurrence-test-boundary";
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired FakeStorage storage;
    @MockitoBean Clock clock;
    HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    String token;
    UUID author;
    long before;

    @BeforeEach void login() throws Exception {
        when(clock.instant()).thenReturn(NOW);
        storage.calls.set(0); storage.fail = false;
        String email = UUID.randomUUID() + "@example.com";
        String password = "synthetic password for HTTP tests";
        var registered = json("/api/auth/register", Map.of("name", "Pessoa teste", "email", email, "password", password), null);
        assertThat(registered.statusCode()).isEqualTo(201);
        author = UUID.fromString(mapper.readTree(registered.body()).get("id").asString());
        var login = json("/api/auth/login", Map.of("email", email, "password", password), null);
        assertThat(login.statusCode()).isEqualTo(200);
        token = mapper.readTree(login.body()).get("accessToken").asString();
        before = count();
    }

    @Test void categoriesAndRealFormatsPersistWithServerOwnedIdentity() throws Exception {
        var categories = send(HttpRequest.newBuilder(uri("/api/occurrence-categories"))
                .header("Authorization", "Bearer " + token).GET());
        assertThat(categories.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(categories.body()).size()).isEqualTo(8);
        assertThat(jdbc.queryForList("select name from occurrence_categories order by id", String.class))
                .containsExactly("Iluminação pública", "Buraco ou pavimentação", "Lixo ou descarte irregular",
                        "Saneamento ou alagamento", "Calçada ou acessibilidade", "Sinalização ou trânsito", "Árvore ou área verde", "Outro");
        for (String extension : List.of("jpg", "png", "webp")) {
            var parts = valid(); parts.set(5, image(ImageFixtures.photo(extension), mime(extension)));
            parts.add(text("authorId", UUID.randomUUID().toString())); parts.add(text("status", "APPROVED"));
            var result = upload(parts, token);
            assertThat(result.statusCode()).as(result.body()).isEqualTo(201);
            assertThat(result.headers().firstValue("Location")).isEmpty();
            var body = mapper.readTree(result.body());
            assertThat(body.get("status").asString()).isEqualTo("PENDING");
            assertThat(body.get("title").asString()).isEqualTo("Buraco na rua");
            var row = jdbc.queryForMap("select * from occurrences where id = ?", UUID.fromString(body.get("id").asString()));
            assertThat(row).containsEntry("author_id", author).containsEntry("category_id", 1).containsEntry("status", "PENDING")
                    .containsEntry("image_key", storage.lastKey);
            assertThat((String) row.get("image_key")).startsWith("occurrences/");
            assertThat(storage.lastBytes).containsExactly(ImageFixtures.photo(extension));
        }
        assertThat(count()).isEqualTo(before + 3);
        assertThat(storage.calls).hasValue(3);
    }

    @Test void textBoundsTrimAndUnicodeMatchPostgres() throws Exception {
        var bounds = Map.of("title", new int[]{5, 100}, "description", new int[]{20, 1000},
                "neighborhood", new int[]{2, 100}, "reference", new int[]{5, 200});
        for (var entry : bounds.entrySet()) {
            for (int size : new int[]{entry.getValue()[0] - 1, entry.getValue()[1] + 1}) {
                reject(replace(valid(), text(entry.getKey(), "😀".repeat(size))), 400);
            }
            for (int size : entry.getValue()) {
                String value = "😀".repeat(size);
                var result = upload(replace(valid(), text(entry.getKey(), " \t" + value + "\r\n ")), token);
                assertThat(result.statusCode()).as(result.body()).isEqualTo(201);
                assertThat(mapper.readTree(result.body()).get(entry.getKey()).asString()).isEqualTo(value);
            }
        }
        reject(replace(valid(), text("title", "ab\u0000cde")), 400);
    }

    @Test void missingInvalidAndRepeatedFieldsNeverReachStorage() throws Exception {
        for (String name : List.of("categoryId", "title", "description", "neighborhood", "reference", "image")) {
            var missing = valid(); missing.removeIf(part -> part.name().equals(name)); reject(missing, 400);
            var duplicate = valid(); duplicate.add(duplicate.stream().filter(part -> part.name().equals(name)).findFirst().orElseThrow());
            reject(duplicate, 400);
        }
        for (String category : List.of("", "xyz", "999", "0")) reject(replace(valid(), text("categoryId", category)), 400);
        var noImageFile = replace(valid(), text("image", "not a file")); reject(noImageFile, 400);
        for (String name : List.of("extra", "title", "status")) {
            for (String filename : List.of("photo.png", "")) {
                var extra = valid(); extra.add(new Part(name, filename, "image/png", ImageFixtures.photo("png"))); reject(extra, 400);
            }
        }
        var emptySecond = valid(); emptySecond.add(new Part("image", "", "image/png", new byte[0])); reject(emptySecond, 400);
        reject(replace(valid(), new Part("image", "", "image/png", new byte[0])), 400);
        assertThat(count()).isEqualTo(before);
    }

    @Test void rejectsInvalidContentWithConsistentSanitizedEnvelope() throws Exception {
        for (byte[] invalid : List.of(new byte[0], Arrays.copyOf(ImageFixtures.photo("png"), 16),
                ImageFixtures.pngWithDimensions(8193, 1), ImageFixtures.pngWithDimensions(5001, 5000),
                ImageFixtures.resource("animated.png"))) {
            reject(replace(valid(), image(invalid, "image/png")), 400);
        }
        for (String extension : List.of("jpg", "webp")) {
            byte[] original = ImageFixtures.photo(extension);
            reject(replace(valid(), image(Arrays.copyOf(original, original.length - 16), mime(extension))), 400);
        }
        reject(replace(valid(), image(ImageFixtures.resource("animated.webp"), "image/webp")), 400);
        reject(replace(valid(), image(ImageFixtures.photo("png"), "image/jpeg")), 400);
        reject(replace(valid(), image(ImageFixtures.photo("png"), "image/gif")), 400);
    }

    @Test void inclusiveFileLimitAndTransportErrorsUseRealHttp() throws Exception {
        var accepted = upload(replace(valid(), image(ImageFixtures.pngOfSize(LIMIT), "image/png")), token);
        assertThat(accepted.statusCode()).as(accepted.body()).isEqualTo(201);
        reject(replace(valid(), image(ImageFixtures.pngOfSize(LIMIT + 1), "image/png")), 413);
        var oversizedRequest = valid(); oversizedRequest.add(text("extra", "a".repeat(6 * 1024 * 1024)));
        reject(oversizedRequest, 413);
    }

    @Test void absentExpiredRevokedSessionsDoNotUploadOrPersist() throws Exception {
        var parts = valid();
        assertThat(upload(parts, null).statusCode()).isEqualTo(401);
        when(clock.instant()).thenReturn(NOW.plusSeconds(1800));
        assertThat(upload(parts, token).statusCode()).isEqualTo(401);
        when(clock.instant()).thenReturn(NOW);
        assertThat(json("/api/auth/logout", Map.of(), token).statusCode()).isEqualTo(204);
        assertThat(upload(parts, token).statusCode()).isEqualTo(401);
        assertThat(storage.calls).hasValue(0); assertThat(count()).isEqualTo(before);
    }

    @Test void providerFailureDoesNotLeakDetailsOrCreateOccurrence() throws Exception {
        storage.fail = true;
        var response = upload(valid(), token);
        assertThat(response.statusCode()).isEqualTo(502);
        assertThat(response.body()).doesNotContain("secret", "provider", "stackTrace", "photo.png");
        assertThat(mapper.readTree(response.body()).get("code").asString()).isEqualTo("IMAGE_STORAGE_UNAVAILABLE");
        assertThat(count()).isEqualTo(before);
    }

    @Test void v4ConstraintsRejectInvalidRowsWithoutChangingMigration() throws Exception {
        var result = upload(valid(), token);
        UUID id = UUID.fromString(mapper.readTree(result.body()).get("id").asString());
        for (String assignment : List.of("title = 'tiny'", "description = 'tiny'", "neighborhood = 'x'", "reference = 'tiny'",
                "status = 'APPROVED'", "category_id = 999", "author_id = '00000000-0000-0000-0000-000000000000'")) {
            assertThatThrownBy(() -> jdbc.update("update occurrences set " + assignment + " where id = ?", id))
                    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        }
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version = '4' and success", Integer.class)).isEqualTo(1);
    }

    void reject(List<Part> parts, int expected) throws Exception {
        int calls = storage.calls.get(); long rows = count();
        var response = upload(parts, token);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(expected);
        var body = mapper.readTree(response.body());
        for (String field : List.of("timestamp", "status", "error", "message", "path", "code")) assertThat(body.has(field)).isTrue();
        assertThat(body.get("path").asString()).isEqualTo("/api/occurrences");
        assertThat(response.body()).doesNotContain("stackTrace", "secret", "photo.png", "Exception");
        assertThat(storage.calls).hasValue(calls); assertThat(count()).isEqualTo(rows);
    }

    long count() { return jdbc.queryForObject("select count(*) from occurrences", Long.class); }
    URI uri(String path) { return URI.create("http://localhost:" + port + path); }
    HttpResponse<String> send(HttpRequest.Builder builder) throws Exception {
        return client.send(builder.timeout(Duration.ofSeconds(30)).build(), HttpResponse.BodyHandlers.ofString());
    }
    HttpResponse<String> json(String path, Map<String, String> body, String credential) throws Exception {
        var request = HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        if (credential != null) request.header("Authorization", "Bearer " + credential);
        return send(request);
    }
    HttpResponse<String> upload(List<Part> parts, String credential) throws Exception {
        var bytes = new ByteArrayOutputStream();
        for (var part : parts) {
            String header = "--" + BOUNDARY + "\r\nContent-Disposition: form-data; name=\"" + part.name() + "\""
                    + (part.filename() == null ? "" : "; filename=\"" + part.filename() + "\"")
                    + "\r\nContent-Type: " + part.type() + "\r\n\r\n";
            bytes.write(header.getBytes(StandardCharsets.UTF_8)); bytes.write(part.content()); bytes.write("\r\n".getBytes(StandardCharsets.UTF_8));
        }
        bytes.write(("--" + BOUNDARY + "--\r\n").getBytes(StandardCharsets.UTF_8));
        var request = HttpRequest.newBuilder(uri("/api/occurrences"))
                .header("Content-Type", "multipart/form-data; boundary=" + BOUNDARY)
                .POST(HttpRequest.BodyPublishers.ofByteArray(bytes.toByteArray()));
        if (credential != null) request.header("Authorization", "Bearer " + credential);
        return send(request);
    }
    static List<Part> valid() {
        return new ArrayList<>(List.of(text("categoryId", "1"), text("title", "  Buraco na rua  "),
                text("description", "Descrição sintética do problema urbano."), text("neighborhood", "Centro"),
                text("reference", "Próximo à praça"), image(ImageFixtures.photo("png"), "image/png")));
    }
    static List<Part> replace(List<Part> parts, Part replacement) {
        parts.removeIf(part -> part.name().equals(replacement.name())); parts.add(replacement); return parts;
    }
    static Part text(String name, String value) { return new Part(name, null, "text/plain; charset=UTF-8", value.getBytes(StandardCharsets.UTF_8)); }
    static Part image(byte[] bytes, String type) { return new Part("image", "photo.png", type, bytes); }
    static String mime(String extension) { return "image/" + (extension.equals("jpg") ? "jpeg" : extension); }
    record Part(String name, String filename, String type, byte[] content) {}

    @TestConfiguration(proxyBeanMethods = false)
    static class StorageConfiguration { @Bean FakeStorage fakeStorage() { return new FakeStorage(); } }
    static class FakeStorage implements ImageStorage {
        AtomicInteger calls = new AtomicInteger(); volatile boolean fail; volatile String lastKey; volatile byte[] lastBytes;
        @Override public StoredImage store(InputStream input, long length, String type) { throw new AssertionError("Prefix required"); }
        @Override public StoredImage store(InputStream input, long length, String type, String prefix) {
            calls.incrementAndGet();
            if (fail) throw new ImageStorageException("provider secret should never leak");
            try { lastBytes = input.readAllBytes(); } catch (java.io.IOException exception) { throw new AssertionError(exception); }
            lastKey = prefix + "/" + UUID.randomUUID() + "." + (type.equals("image/jpeg") ? "jpg" : type.substring(6));
            return new StoredImage(lastKey);
        }
        @Override public StoredImageContent load(String key) { throw new AssertionError("No public read in this scope"); }
    }
}
