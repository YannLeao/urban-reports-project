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
        properties = {"spring.config.import=", "spring.profiles.active=", "image.storage.endpoint=", "image.recovery.enabled=false"})
@Import({TestcontainersConfiguration.class, OccurrenceHttpTests.StorageConfiguration.class})
class OccurrenceHttpTests {
    static final Instant NOW = Instant.parse("2026-09-30T12:00:00Z");
    static final int LIMIT = 5 * 1024 * 1024;
    static final String BOUNDARY = "occurrence-test-boundary";
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired FakeStorage storage;
    @Autowired UploadJournal journal;
    @MockitoBean Clock clock;
    HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    String token;
    UUID author;
    long before;

    @BeforeEach void login() throws Exception {
        when(clock.instant()).thenReturn(NOW);
        storage.calls.set(0); storage.failAt = 0; storage.loseAt = 0; storage.fail = false; storage.loseResponse = false; storage.failDelete = false;
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

    @Test void registrationEditingAndDeletionNeverCreateNotificationEmailDeliveries() throws Exception {
        long initial = jdbc.queryForObject("SELECT count(*) FROM occurrence_notification_email_deliveries", Long.class);
        var created = upload(valid(), token);
        assertThat(created.statusCode()).isEqualTo(201);
        String path = "/api/occurrences/" + mapper.readTree(created.body()).get("id").asString();
        assertThat(multipart(path, "PUT", valid(), token, "\"0\"").statusCode()).isEqualTo(200);
        assertThat(action(path, "DELETE", token, "\"1\"").statusCode()).isEqualTo(204);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM occurrence_notification_email_deliveries", Long.class)).isEqualTo(initial);
    }

    @Test void locationContractRejectsInvalidPairsBeforeUpload() throws Exception {
        var absent = valid(); absent.removeIf(part -> List.of("latitude", "longitude").contains(part.name()));
        reject(absent, 400);
        for (String axis : List.of("latitude", "longitude")) {
            for (String value : List.of("", " ", "null", "NaN", "Infinity", "-Infinity", "1e999", "0x1.0p2", "1,5", "text",
                    axis.equals("latitude") ? "90.000001" : "180.000001",
                    axis.equals("latitude") ? "-90.000001" : "-180.000001"))
                reject(replace(valid(), text(axis, value)), 400);
        }
        assertThat(storage.calls).hasValue(0);
        assertThat(count()).isEqualTo(before);
    }

    @Test void locationRoundTripsBoundsZerosAndPrecisionInPrivateAndPublicReads() throws Exception {
        for (double[] point : List.of(new double[]{0, 0}, new double[]{0, 180}, new double[]{90, 0},
                new double[]{-90, -180}, new double[]{-23.550520123456, -46.633308987654})) {
            var parts = replace(replace(valid(), text("latitude", Double.toString(point[0]))), text("longitude", Double.toString(point[1])));
            var created = upload(parts, token);
            assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
            var id = mapper.readTree(created.body()).get("id").asString();
            for (String path : List.of("/api/occurrences/" + id, "/api/public/occurrences/" + id)) {
                var response = action(path, "GET", token, null);
                assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
                var body = mapper.readTree(response.body());
                assertThat(body.get("latitude").asDouble()).isEqualTo(point[0]);
                assertThat(body.get("longitude").asDouble()).isEqualTo(point[1]);
            }
        }
    }

    @Test void locationUpdatePreservesOmissionRejectsClearingAndEnrichesLegacy() throws Exception {
        var created = upload(valid(), token);
        UUID id = UUID.fromString(mapper.readTree(created.body()).get("id").asString());
        String path = "/api/occurrences/" + id;
        var omitted = valid(); omitted.removeIf(part -> List.of("latitude", "longitude", "image").contains(part.name()));
        var unchanged = multipart(path, "PUT", omitted, token, "\"0\"");
        assertThat(unchanged.statusCode()).as(unchanged.body()).isEqualTo(200);
        assertThat(mapper.readTree(unchanged.body()).get("latitude").asDouble()).isEqualTo(-23.550520);
        var cleared = new ArrayList<>(omitted); cleared.add(text("latitude", "")); cleared.add(text("longitude", ""));
        assertThat(multipart(path, "PUT", cleared, token, "\"1\"").statusCode()).isEqualTo(400);
        assertThat(jdbc.queryForObject("SELECT version FROM occurrences WHERE id = ?", Long.class, id)).isEqualTo(1L);
        var moved = replace(replace(new ArrayList<>(omitted), text("latitude", "0")), text("longitude", "123.123456789"));
        assertThat(multipart(path, "PUT", moved, token, "\"1\"").statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT longitude FROM occurrences WHERE id = ?", Double.class, id)).isEqualTo(123.123456789);
        // Model an existing pre-V9 row, without synthesizing any geographic point.
        jdbc.update("UPDATE occurrences SET latitude = NULL, longitude = NULL WHERE id = ?", id);
        for (String read : List.of(path, "/api/public/occurrences/" + id)) {
            var legacy = mapper.readTree(action(read, "GET", token, null).body());
            assertThat(legacy.get("latitude").isNull()).isTrue();
            assertThat(legacy.get("longitude").isNull()).isTrue();
        }
        var legacyEdit = multipart(path, "PUT", omitted, token, "\"2\"");
        assertThat(legacyEdit.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(legacyEdit.body()).get("latitude").isNull()).isTrue();
        assertThat(multipart(path, "PUT", moved, token, "\"3\"").statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT latitude FROM occurrences WHERE id = ?", Double.class, id)).isZero();
        assertThat(multipart(path, "PUT", valid(), token, "\"3\"").statusCode()).isEqualTo(412);
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
            assertThat(row).containsEntry("author_id", author).containsEntry("category_id", 1).containsEntry("status", "PENDING");
            assertThat(jdbc.queryForObject("select object_key from occurrence_media where occurrence_id = ?", String.class, UUID.fromString(body.get("id").asString()))).isEqualTo(storage.lastKey);
            assertThat(storage.lastBytes).containsExactly(ImageFixtures.photo(extension));
        }
        assertThat(count()).isEqualTo(before + 3);
        assertThat(storage.calls).hasValue(3);
    }

    @Test void textBoundsTrimAndUnicodeMatchPostgres() throws Exception {
        var bounds = Map.of("title", new int[]{5, 100},
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
        for (String name : List.of("categoryId", "title", "description", "neighborhood", "reference", "image", "latitude", "longitude")) {
            if (!name.equals("description")) { var missing = valid(); missing.removeIf(part -> part.name().equals(name)); reject(missing, 400); }
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
        var oversizedRequest = valid(); oversizedRequest.add(text("extra", "a".repeat(27 * 1024 * 1024)));
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

    @Test void uploadedObjectWithLostResponseIsRecoveredWithoutOccurrence() throws Exception {
        storage.loseResponse = true;
        assertThat(upload(valid(), token).statusCode()).isEqualTo(502);
        String key = storage.lastKey;
        assertThat(storage.objects).contains(key);
        assertThat(count()).isEqualTo(before);
        when(clock.instant()).thenReturn(NOW.plusSeconds(301));
        journal.recover();
        assertThat(storage.objects).doesNotContain(key);
        assertThat(storage.deleted).contains(key);
    }

    @Test void flushAndDeferredCommitFailuresRecoverUploadedObjects() throws Exception {
        for (boolean deferred : List.of(false, true)) {
            jdbc.execute("""
                    create function reject_test_occurrence() returns trigger language plpgsql as $$
                    begin raise exception 'synthetic persistence failure'; end $$
                    """);
            jdbc.execute(deferred
                    ? "create constraint trigger reject_test_occurrence after insert on occurrences deferrable initially deferred for each row execute function reject_test_occurrence()"
                    : "create trigger reject_test_occurrence before insert on occurrences for each row execute function reject_test_occurrence()");
            try {
                assertThat(upload(photos(5), token).statusCode()).isEqualTo(500);
                String key = storage.lastKey;
                assertThat(storage.objects).contains(key);
                assertThat(count()).isEqualTo(before);
                assertThat(jdbc.queryForObject("select state from image_upload_journal where image_key = ?", String.class, key))
                        .isEqualTo("PENDING");
                when(clock.instant()).thenReturn(NOW.plusSeconds(301)); journal.recover();
                assertThat(storage.objects).doesNotContain(key);
            } finally {
                jdbc.execute("drop trigger reject_test_occurrence on occurrences");
                jdbc.execute("drop function reject_test_occurrence()");
                when(clock.instant()).thenReturn(NOW);
            }
        }
    }

    @Test void recoveryPreservesReferenceEvenWhenJournalNeedsReconciliation() throws Exception {
        var response = upload(valid(), token);
        assertThat(response.statusCode()).isEqualTo(201);
        String key = storage.lastKey;
        jdbc.update("update image_upload_journal set state = 'PENDING', next_attempt_at = ? where image_key = ?",
                java.sql.Timestamp.from(NOW.minusSeconds(1)), key);
        journal.recover();
        assertThat(jdbc.queryForObject("select state from image_upload_journal where image_key = ?", String.class, key))
                .isEqualTo("LINKED");
        assertThat(storage.deleted).doesNotContain(key);
    }

    @Test void v4ConstraintsRejectInvalidRowsWithoutChangingMigration() throws Exception {
        var result = upload(valid(), token);
        UUID id = UUID.fromString(mapper.readTree(result.body()).get("id").asString());
        for (String assignment : List.of("title = 'tiny'",  "neighborhood = 'x'", "reference = 'tiny'",
                "status = 'APPROVED'", "category_id = 999", "author_id = '00000000-0000-0000-0000-000000000000'")) {
            assertThatThrownBy(() -> jdbc.update("update occurrences set " + assignment + " where id = ?", id))
                    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        }
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version = '4' and success", Integer.class)).isEqualTo(1);
    }

    @Test void missingOrInvalidStoredPhotoDoesNotBreakPrivateDetail() throws Exception {
        var created = upload(valid(), token);
        String path = "/api/occurrences/" + mapper.readTree(created.body()).get("id").asString();
        String key = storage.lastKey;
        storage.fail = true;
        assertThat(action(path + "/image", "GET", token, null).statusCode()).isEqualTo(502);
        storage.fail = false;
        storage.contents.put(key, new StoredImageContent("<html>".getBytes(StandardCharsets.UTF_8), 6, "text/html"));
        assertThat(action(path + "/image", "GET", token, null).statusCode()).isEqualTo(502);
        storage.objects.remove(key);
        assertThat(action(path + "/image", "GET", token, null).statusCode()).isEqualTo(404);
        assertThat(action(path, "GET", token, null).statusCode()).isEqualTo(200);
    }

    @Test void optionalDescriptionAcrossCreationAndEditingUsesCodePoints() throws Exception {
        for (String value : List.of("", " \t\r\n ", "Muito lixo.", "😀".repeat(1000))) {
            var parts = replace(valid(), text("description", value));
            var created = upload(parts, token);
            assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
            UUID id = UUID.fromString(mapper.readTree(created.body()).get("id").asString());
            String expected = value.trim().isEmpty() ? null : value.trim();
            assertThat(jdbc.queryForObject("select description from occurrences where id = ?", String.class, id)).isEqualTo(expected);
            parts.removeIf(part -> part.name().equals("image"));
            var edited = multipart("/api/occurrences/" + id, "PUT", parts, token, "\"0\"");
            assertThat(edited.statusCode()).as(edited.body()).isEqualTo(200);
            assertThat(mapper.readTree(edited.body()).get("version").asLong()).isEqualTo(1);
            var cleared = multipart("/api/occurrences/" + id, "PUT", replace(parts, text("description", "  ")), token, "\"1\"");
            assertThat(cleared.statusCode()).as(cleared.body()).isEqualTo(200);
            assertThat(mapper.readTree(cleared.body()).get("description").isNull()).isTrue();
            assertThat(multipart("/api/occurrences/" + id, "PUT", replace(parts, text("description", "😀".repeat(1001))), token, "\"2\"").statusCode()).isEqualTo(400);
        }
        var omitted = valid(); omitted.removeIf(part -> part.name().equals("description"));
        var result = upload(omitted, token);
        assertThat(result.statusCode()).as(result.body()).isEqualTo(201);
        assertThat(mapper.readTree(result.body()).get("description").isNull()).isTrue();
        omitted.removeIf(part -> part.name().equals("image"));
        assertThat(multipart("/api/occurrences/" + mapper.readTree(result.body()).get("id").asString(), "PUT", omitted, token, "\"0\"").statusCode()).isEqualTo(200);
        reject(replace(valid(), text("description", "😀".repeat(1001))), 400);
    }

    HttpResponse<String> action(String path, String method, String credential, String match) throws Exception {
        var request = HttpRequest.newBuilder(uri(path)).method(method, HttpRequest.BodyPublishers.noBody());
        if (credential != null) request.header("Authorization", "Bearer " + credential);
        if (match != null) request.header("If-Match", match);
        return send(request);
    }

    @Test void privateImageAndWritesRequireOwnershipSessionAndCurrentVersion() throws Exception {
        String ownerToken = token;
        var created = upload(valid(), token);
        UUID id = UUID.fromString(mapper.readTree(created.body()).get("id").asString());
        String path = "/api/occurrences/" + id;
        String key = storage.lastKey;
        var photo = client.send(HttpRequest.newBuilder(uri(path + "/image")).header("Authorization", "Bearer " + token).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        assertThat(photo.statusCode()).isEqualTo(200);
        assertThat(photo.body()).containsExactly(ImageFixtures.photo("png"));
        assertThat(photo.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(photo.headers().firstValue("X-Content-Type-Options")).contains("nosniff");
        assertThat(photo.headers().firstValue("Content-Type")).contains("image/png");
        var fields = valid(); fields.removeIf(part -> part.name().equals("image"));
        assertThat(multipart(path, "PUT", fields, token, null).statusCode()).isEqualTo(428);
        assertThat(action(path, "DELETE", token, null).statusCode()).isEqualTo(428);
        assertThat(multipart(path, "PUT", fields, token, "\"99\"").statusCode()).isEqualTo(412);
        assertThat(action(path, "DELETE", token, "\"99\"").statusCode()).isEqualTo(412);
        login(); // second real citizen and session
        for (String route : List.of(path, path + "/image")) {
            assertThat(action(route, "GET", token, null).statusCode()).isEqualTo(404);
            assertThat(action(route, "GET", null, null).statusCode()).isEqualTo(401);
        }
        assertThat(multipart(path, "PUT", fields, token, "\"0\"").statusCode()).isEqualTo(404);
        assertThat(action(path, "DELETE", token, "\"0\"").statusCode()).isEqualTo(404);
        assertThat(multipart(path, "PUT", fields, null, "\"0\"").statusCode()).isEqualTo(401);
        assertThat(action(path, "DELETE", null, "\"0\"").statusCode()).isEqualTo(401);
        assertThat(multipart("/api/occurrences/" + UUID.randomUUID(), "PUT", fields, token, "\"0\"").statusCode()).isEqualTo(404);
        assertThat(action("/api/occurrences/" + UUID.randomUUID(), "DELETE", token, "\"0\"").statusCode()).isEqualTo(404);
        var updated = multipart(path, "PUT", fields, ownerToken, "\"0\"");
        assertThat(updated.statusCode()).as(updated.body()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select object_key from occurrence_media where occurrence_id = ?", String.class, id)).isEqualTo(key);
        assertThat(storage.deleted).doesNotContain(key);
        assertThat(multipart(path, "PUT", fields, ownerToken, "\"0\"").statusCode()).isEqualTo(412);
        when(clock.instant()).thenReturn(NOW.plusSeconds(1800));
        assertThat(action(path + "/image", "GET", ownerToken, null).statusCode()).isEqualTo(401);
        when(clock.instant()).thenReturn(NOW);
        assertThat(json("/api/auth/logout", Map.of(), ownerToken).statusCode()).isEqualTo(204);
        assertThat(action(path + "/image", "GET", ownerToken, null).statusCode()).isEqualTo(401);
        assertThat(action(path, "DELETE", ownerToken, "\"1\"").statusCode()).isEqualTo(401);
    }

    @Test void replacementAndDeletionRetireOnlyAfterCommitAndRetryAfterRestart() throws Exception {
        var created = upload(valid(), token);
        UUID id = UUID.fromString(mapper.readTree(created.body()).get("id").asString());
        String old = storage.lastKey, path = "/api/occurrences/" + id;
        assertThat(multipart(path, "PUT", valid(), token, "\"0\"").statusCode()).isEqualTo(200);
        String current = storage.lastKey;
        assertThat(current).isNotEqualTo(old);
        assertThat(storage.objects).contains(old, current);
        assertThat(jdbc.queryForObject("select state from image_upload_journal where image_key = ?", String.class, old)).isEqualTo("TOMBSTONE");
        when(clock.instant()).thenReturn(NOW.plusSeconds(301));
        storage.failDelete = true; journal.recover();
        assertThat(storage.objects).contains(old, current);
        storage.failDelete = false;
        when(clock.instant()).thenReturn(NOW.plusSeconds(362)); journal.recover();
        assertThat(storage.objects).doesNotContain(old).contains(current);
        assertThat(action(path, "DELETE", token, "\"1\"").statusCode()).isEqualTo(204);
        assertThat(storage.objects).contains(current);
        for (String route : List.of(path, path + "/image")) assertThat(action(route, "GET", token, null).statusCode()).isEqualTo(404);
        assertThat(action(path, "DELETE", token, "\"1\"").statusCode()).isEqualTo(404);
        assertThat(action("/api/occurrences", "GET", token, null).body()).doesNotContain(id.toString());
        when(clock.instant()).thenReturn(NOW.plusSeconds(700));
        new UploadJournal(jdbc, manager, imageService, clock, Duration.ofMinutes(5), 20).recover();
        assertThat(storage.objects).doesNotContain(current);
    }

    @Autowired org.springframework.transaction.PlatformTransactionManager manager;
    @Autowired ImageStorageService imageService;

    @Test void failedCommitPreservesOldPhotoAndRollsBackRetirement() throws Exception {
        var created = upload(valid(), token);
        UUID id = UUID.fromString(mapper.readTree(created.body()).get("id").asString());
        String old = storage.lastKey;
        jdbc.execute("create function reject_test_edit() returns trigger language plpgsql as $$ begin raise exception 'synthetic commit failure'; end $$");
        jdbc.execute("create constraint trigger reject_test_edit after update on occurrences deferrable initially deferred for each row execute function reject_test_edit()");
        String fresh;
        try {
            var moved = replace(replace(valid(), text("latitude", "0")), text("longitude", "123.123456789"));
            assertThat(multipart("/api/occurrences/" + id, "PUT", moved, token, "\"0\"").statusCode()).isEqualTo(500);
            fresh = storage.lastKey;
            assertThat(jdbc.queryForObject("select latitude from occurrences where id = ?", Double.class, id)).isEqualTo(-23.550520);
            assertThat(jdbc.queryForObject("select longitude from occurrences where id = ?", Double.class, id)).isEqualTo(-46.633308);
            assertThat(jdbc.queryForObject("select object_key from occurrence_media where occurrence_id = ?", String.class, id)).isEqualTo(old);
            assertThat(jdbc.queryForObject("select version from occurrences where id = ?", Long.class, id)).isZero();
            assertThat(jdbc.queryForObject("select state from image_upload_journal where image_key = ?", String.class, old)).isEqualTo("LINKED");
            assertThat(jdbc.queryForObject("select state from image_upload_journal where image_key = ?", String.class, fresh)).isEqualTo("PENDING");
        } finally { jdbc.execute("drop trigger reject_test_edit on occurrences"); jdbc.execute("drop function reject_test_edit()"); }
        when(clock.instant()).thenReturn(NOW.plusSeconds(301)); journal.recover();
        assertThat(storage.objects).contains(old).doesNotContain(fresh);
    }

    @Test void concurrentEditsAndEditVersusDeleteAcceptAtMostOneVersion() throws Exception {
        for (boolean deletion : List.of(false, true)) {
            var created = upload(valid(), token);
            UUID id = UUID.fromString(mapper.readTree(created.body()).get("id").asString());
            String path = "/api/occurrences/" + id;
            var gate = new java.util.concurrent.CountDownLatch(1);
            try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
                var first = executor.submit(() -> { gate.await(); return multipart(path, "PUT", valid(), token, "\"0\""); });
                var second = executor.submit(() -> { gate.await(); return deletion ? action(path, "DELETE", token, "\"0\"") : multipart(path, "PUT", valid(), token, "\"0\""); });
                gate.countDown();
                var a = first.get(30, java.util.concurrent.TimeUnit.SECONDS); var b = second.get(30, java.util.concurrent.TimeUnit.SECONDS);
                var codes = List.of(a.statusCode(), b.statusCode());
                assertThat(codes).as("Responses: %s / %s", a.body(), b.body()).allMatch(code -> List.of(200, 204, 404, 412).contains(code));
                assertThat(codes.stream().filter(code -> code == 200 || code == 204).count()).isEqualTo(1);
                assertThat(codes.stream().filter(code -> code == 412 || code == 404).count()).isEqualTo(1);
                assertThat(jdbc.queryForObject("select count(*) from occurrences where id = ? and version > 1", Integer.class, id)).isZero();
                when(clock.instant()).thenReturn(NOW.plusSeconds(301)); journal.recover();
                for (String key : jdbc.queryForList("select object_key from occurrence_media where occurrence_id = ?", String.class, id)) assertThat(storage.objects).contains(key);
                when(clock.instant()).thenReturn(NOW);
            }
        }
    }

    @Test void rejectedImageAndMultipartKeepAssociationAndPreflightAllowsIfMatch() throws Exception {
        var created = upload(valid(), token);
        UUID id = UUID.fromString(mapper.readTree(created.body()).get("id").asString());
        String path = "/api/occurrences/" + id, old = storage.lastKey;
        for (var parts : List.of(replace(valid(), image(new byte[0], "image/png")), replace(valid(), image(new byte[]{1,2}, "image/png")), replace(valid(), text("categoryId", "999"))))
            assertThat(multipart(path, "PUT", parts, token, "\"0\"").statusCode()).isEqualTo(400);
        var duplicate = valid(); duplicate.add(text("description", "extra"));
        assertThat(multipart(path, "PUT", duplicate, token, "\"0\"").statusCode()).isEqualTo(400);
        assertThat(jdbc.queryForObject("select object_key from occurrence_media where occurrence_id = ?", String.class, id)).isEqualTo(old);
        assertThat(storage.deleted).doesNotContain(old);
        storage.fail = true;
        assertThat(multipart(path, "PUT", valid(), token, "\"0\"").statusCode()).isEqualTo(502);
        assertThat(jdbc.queryForObject("select object_key from occurrence_media where occurrence_id = ?", String.class, id)).isEqualTo(old);
        var cors = send(HttpRequest.newBuilder(uri(path)).method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                .header("Origin", "http://localhost:5173").header("Access-Control-Request-Method", "PUT")
                .header("Access-Control-Request-Headers", "authorization,if-match"));
        assertThat(cors.statusCode()).isEqualTo(200);
        assertThat(cors.headers().firstValue("Access-Control-Allow-Headers").orElse("").toLowerCase()).contains("if-match");
    }


    static List<Part> photos(int count) {
        var parts = valid(); parts.removeIf(p -> p.name().equals("image"));
        for (int i = 0; i < count; i++) parts.add(new Part("images", "synthetic.png", "image/png", ImageFixtures.photo("png")));
        return parts;
    }
    Part manifest(Object items) throws Exception {
        return new Part("media", null, "application/json", mapper.writeValueAsBytes(Map.of("items", items)));
    }
    List<String> mediaIds(String body) { return mapper.readTree(body).get("media").valueStream().map(node -> node.get("id").asString()).toList(); }

    @Test void createsOneToFiveAndRejectsMixedExcessUnexpectedAndInvalidBeforeAnyPut() throws Exception {
        for (int n : List.of(1, 5)) {
            var created = upload(photos(n), token);
            assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
            var body = mapper.readTree(created.body());
            assertThat(body.get("media").size()).isEqualTo(n);
            for (int i = 0; i < n; i++) {
                var media = body.get("media").get(i);
                assertThat(media.get("position").asInt()).isEqualTo(i);
                assertThat(media.get("type").asString()).isEqualTo("IMAGE");
                assertThat(media.get("sizeBytes").asLong()).isEqualTo(ImageFixtures.photo("png").length);
            }
            assertThat(created.body()).doesNotContain("objectKey", "object_key", storage.lastKey, "synthetic.png");
        }
        reject(photos(0), 400); reject(photos(6), 400);
        var mixed = photos(1); mixed.add(image(ImageFixtures.photo("png"), "image/png")); reject(mixed, 400);
        var invalid = photos(4); invalid.add(new Part("images", "", "image/png", new byte[0])); reject(invalid, 400);
        var corrupt = photos(4); corrupt.add(new Part("images", "bad.png", "image/png", new byte[]{1,2})); reject(corrupt, 400);
        var extra = photos(1); extra.add(new Part("other", "", "image/png", new byte[0])); reject(extra, 400);
        var many = photos(1); for (int i = 0; i < 25; i++) many.add(text("extra", "")); reject(many, 413);
    }

    @Test void fiveMaximumFilesFitRealContainerAndOneByteOverFileLimitDoesNot() throws Exception {
        var parts = photos(0); byte[] max = ImageFixtures.pngOfSize(LIMIT);
        for (int i = 0; i < 5; i++) parts.add(new Part("images", "max.png", "image/png", max));
        var created = upload(parts, token); assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        assertThat(mediaIds(created.body())).hasSize(5);
        reject(List.of(text("categoryId", "1"), text("title", "Valid title"), text("neighborhood", "Centro"),
                text("reference", "Praça central"), new Part("images", "max.png", "image/png", new byte[LIMIT + 1])), 413);
    }

    @Test void editReordersFiveToFivePromotesCoverKeepsOmittedMediaAndDeletesAllDurably() throws Exception {
        var created = upload(photos(5), token); assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        var ids = mediaIds(created.body()); UUID id = UUID.fromString(mapper.readTree(created.body()).get("id").asString());
        String path = "/api/occurrences/" + id;
        var keys = jdbc.queryForList("select object_key from occurrence_media where occurrence_id = ? order by position", String.class, id);
        int calls = storage.calls.get();
        var reverse = new ArrayList<>(ids); Collections.reverse(reverse);
        var parts = photos(0); parts.add(manifest(reverse.stream().map(value -> Map.of("id", value)).toList()));
        var updated = multipart(path, "PUT", parts, token, "\"0\"");
        assertThat(updated.statusCode()).as(updated.body()).isEqualTo(200);
        assertThat(mediaIds(updated.body())).containsExactlyElementsOf(reverse);
        assertThat(storage.calls).hasValue(calls);
        assertThat(jdbc.queryForObject("select object_key from occurrence_media where occurrence_id = ? and position = 0", String.class, id)).isEqualTo(keys.get(4));
        assertThat(multipart(path, "PUT", photos(0), token, "\"1\"").statusCode()).isEqualTo(200);
        assertThat(mediaIds(action(path, "GET", token, null).body())).containsExactlyElementsOf(reverse);
        assertThat(multipart(path, "PUT", valid(), token, "\"2\"").statusCode()).isEqualTo(400);
        assertThat(multipart(path, "PUT", photos(1), token, "\"2\"").statusCode()).isEqualTo(400);
        var retained = reverse.subList(1, 4); var finalItems = new ArrayList<Object>();
        retained.forEach(value -> finalItems.add(Map.of("id", value))); finalItems.add(Map.of("uploadIndex", 0)); finalItems.add(Map.of("uploadIndex", 1));
        var replacement = photos(2); replacement.add(manifest(finalItems));
        var changed = multipart(path, "PUT", replacement, token, "\"2\"");
        assertThat(changed.statusCode()).as(changed.body()).isEqualTo(200);
        assertThat(mediaIds(changed.body()).subList(0, 3)).containsExactlyElementsOf(retained);
        assertThat(jdbc.queryForObject("select state from image_upload_journal where image_key = ?", String.class, keys.get(4))).isEqualTo("TOMBSTONE");
        assertThat(action(path + "/image", "GET", token, null).statusCode()).isEqualTo(200);
        // Force reconciliation to exercise all references, especially non-cover photos.
        jdbc.update("update image_upload_journal set state='PENDING', next_attempt_at=? where image_key in (select object_key from occurrence_media where occurrence_id=?)", java.sql.Timestamp.from(NOW), id);
        journal.recover();
        for (String key : jdbc.queryForList("select object_key from occurrence_media where occurrence_id=?", String.class, id)) assertThat(storage.deleted).doesNotContain(key);
        assertThat(action(path, "DELETE", token, "\"3\"").statusCode()).isEqualTo(204);
        assertThat(jdbc.queryForObject("select count(*) from occurrence_media where occurrence_id=?", Integer.class, id)).isZero();
        when(clock.instant()).thenReturn(NOW.plusSeconds(301)); journal.recover();
        for (String key : keys) assertThat(storage.objects).doesNotContain(key);
    }

    @Test void strictManifestRejectsForeignDuplicateAmbiguousUnusedAndInvalidInputsWithoutUploads() throws Exception {
        var created = upload(photos(2), token); var ids = mediaIds(created.body());
        String path = "/api/occurrences/" + mapper.readTree(created.body()).get("id").asString();
        int calls = storage.calls.get();
        for (String json : List.of("{}", "[]", "{\"items\":[]}", "{\"items\":[{\"id\":\"" + ids.getFirst() + "\",\"uploadIndex\":0}]}",
                "{\"items\":[{\"id\":\"" + ids.getFirst() + "\",\"other\":1}]}", "{\"items\":[{\"uploadIndex\":-1}]}",
                "{\"items\":[{\"uploadIndex\":0,\"uploadIndex\":1}]}", "{\"items\":[{\"uploadIndex\":0.0}]}", "{\"items\":[]} {}")) {
            var parts = photos(1); parts.add(new Part("media", null, "application/json", json.getBytes(StandardCharsets.UTF_8)));
            assertThat(multipart(path, "PUT", parts, token, "\"0\"").statusCode()).as(json).isEqualTo(400);
        }
        for (Object items : List.of(List.of(Map.of("id", ids.getFirst()), Map.of("id", ids.getFirst())),
                List.of(Map.of("id", UUID.randomUUID().toString())), List.of(Map.of("uploadIndex", 1)),
                List.of(Map.of("uploadIndex", 0), Map.of("uploadIndex", 0)), List.of(Map.of("id", ids.getFirst())))) {
            var parts = photos(1); parts.add(manifest(items));
            assertThat(multipart(path, "PUT", parts, token, "\"0\"").statusCode()).isEqualTo(400);
        }
        assertThat(storage.calls).hasValue(calls);
        assertThat(mediaIds(action(path, "GET", token, null).body())).containsExactlyElementsOf(ids);
    }

    @Test void everyPhotoRequiresMatchingReportAndOwnerAndRejectedPhotosAreAllHidden() throws Exception {
        var created = upload(photos(5), token); var ids = mediaIds(created.body());
        String id = mapper.readTree(created.body()).get("id").asString();
        String privatePath = "/api/occurrences/" + id, publicPath = "/api/public/occurrences/" + id;
        var otherReport = upload(photos(1), token);
        String otherId = mapper.readTree(otherReport.body()).get("id").asString();
        for (String media : ids) {
            assertThat(action("/api/occurrences/" + otherId + "/media/" + media, "GET", token, null).statusCode()).isEqualTo(404);
            assertThat(action("/api/public/occurrences/" + otherId + "/media/" + media, "GET", null, null).statusCode()).isEqualTo(404);
        }
        String ownerToken = token;
        for (String media : ids) {
            var response = action(privatePath + "/media/" + media, "GET", ownerToken, null);
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
            assertThat(action(publicPath + "/media/" + media, "GET", null, null).statusCode()).isEqualTo(200);
            assertThat(action("/api/public/occurrences/" + UUID.randomUUID() + "/media/" + media, "GET", null, null).statusCode()).isEqualTo(404);
        }
        login();
        for (String media : ids) {
            assertThat(action(privatePath + "/media/" + media, "GET", token, null).statusCode()).isEqualTo(404);
            assertThat(action(privatePath + "/media/" + media, "GET", null, null).statusCode()).isEqualTo(401);
            assertThat(action("/api/admin/occurrences/" + id + "/media/" + media, "GET", token, null).statusCode()).isEqualTo(403);
        }
        jdbc.update("update occurrences set status='REJECTED' where id=?", UUID.fromString(id));
        for (String media : ids) {
            assertThat(action(publicPath + "/media/" + media, "GET", null, null).statusCode()).isEqualTo(404);
            assertThat(action(privatePath + "/media/" + media, "GET", ownerToken, null).statusCode()).isEqualTo(200);
        }
    }

    @Test void failureAtSecondThirdOrFifthPutNeverCommitsPartialCollectionAndRecoversAfterRestart() throws Exception {
        for (int failAt : List.of(2, 3, 5)) {
            storage.calls.set(0); storage.failAt = failAt; long rows = count();
            var response = upload(photos(5), token);
            assertThat(response.statusCode()).as(response.body()).isEqualTo(502);
            assertThat(count()).isEqualTo(rows);
            var pending = jdbc.queryForList("select image_key from image_upload_journal where state='PENDING'", String.class);
            assertThat(pending).hasSizeGreaterThanOrEqualTo(5);
            assertThat(storage.deleted).doesNotContainAnyElementsOf(pending);
            when(clock.instant()).thenReturn(NOW.plusSeconds(301));
            new UploadJournal(jdbc, manager, imageService, clock, Duration.ofMinutes(5), 100).recover();
            for (String key : pending) assertThat(storage.objects).doesNotContain(key);
            when(clock.instant()).thenReturn(NOW);
        }
    }

    @Test void concurrentFivePhotoEditsHaveSingleWinnerAndNoPartialReorder() throws Exception {
        var created = upload(photos(5), token); var ids = mediaIds(created.body());
        String path = "/api/occurrences/" + mapper.readTree(created.body()).get("id").asString();
        var reversed = new ArrayList<>(ids); Collections.reverse(reversed);
        var firstParts = photos(0); firstParts.add(manifest(reversed.stream().map(id -> Map.of("id", id)).toList()));
        var secondParts = photos(0); secondParts.add(manifest(ids.subList(0, 3).stream().map(id -> Map.of("id", id)).toList()));
        var gate = new java.util.concurrent.CountDownLatch(1);
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var a = executor.submit(() -> { gate.await(); return multipart(path, "PUT", firstParts, token, "\"0\""); });
            var b = executor.submit(() -> { gate.await(); return multipart(path, "PUT", secondParts, token, "\"0\""); });
            gate.countDown();
            var first = a.get(30, java.util.concurrent.TimeUnit.SECONDS); var second = b.get(30, java.util.concurrent.TimeUnit.SECONDS);
            assertThat(List.of(first.statusCode(), second.statusCode())).containsExactlyInAnyOrder(200, 412);
            var finalIds = mediaIds(action(path, "GET", token, null).body());
            assertThat(finalIds).containsExactlyElementsOf(first.statusCode() == 200 ? reversed : ids.subList(0, 3));
        }
    }

    @Autowired PublicOccurrenceService publicReports;
    @Autowired jakarta.persistence.EntityManagerFactory entityManagers;
    @Test void pagedListsCountReportsOnceAndBatchFiveMediaWithoutDownloadingBytes() throws Exception {
        when(clock.instant()).thenReturn(NOW.plusSeconds(1));
        for (int i = 0; i < 3; i++) assertThat(upload(photos(5), token).statusCode()).isEqualTo(201);
        var stats = entityManagers.unwrap(org.hibernate.SessionFactory.class).getStatistics();
        stats.setStatisticsEnabled(true); stats.clear();
        try {
            int puts = storage.calls.get();
            var page = publicReports.list(0, 2);
            assertThat(page.items()).hasSize(2);
            assertThat(page.items()).allSatisfy(item -> assertThat(item.media()).hasSize(5));
            assertThat(page.totalItems()).isEqualTo(jdbc.queryForObject("select count(*) from occurrences where status <> 'REJECTED'", Long.class));
            assertThat(stats.getPrepareStatementCount()).isLessThanOrEqualTo(4);
            assertThat(stats.getCollectionFetchCount()).isLessThanOrEqualTo(1);
            assertThat(storage.calls).hasValue(puts);
        } finally { stats.setStatisticsEnabled(false); }
    }

    @Test void uncertainThirdPutLeavesAllFiveIntentsAndNoPartialReport() throws Exception {
        storage.loseAt = 3;
        assertThat(upload(photos(5), token).statusCode()).isEqualTo(502);
        assertThat(count()).isEqualTo(before);
        var pending = jdbc.queryForList("select image_key from image_upload_journal where state='PENDING'", String.class);
        assertThat(pending).hasSizeGreaterThanOrEqualTo(5);
        assertThat(storage.objects).contains(storage.lastKey); // Provider accepted bytes before losing response.
        for (String key : pending) assertThat(storage.deleted).doesNotContain(key);
        when(clock.instant()).thenReturn(NOW.plusSeconds(301)); journal.recover();
        for (String key : pending) assertThat(storage.objects).doesNotContain(key);
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
        return multipart("/api/occurrences", "POST", parts, credential, null);
    }
    HttpResponse<String> multipart(String path, String method, List<Part> parts, String credential, String version) throws Exception {
        var bytes = new ByteArrayOutputStream();
        for (var part : parts) {
            String header = "--" + BOUNDARY + "\r\nContent-Disposition: form-data; name=\"" + part.name() + "\""
                    + (part.filename() == null ? "" : "; filename=\"" + part.filename() + "\"")
                    + "\r\nContent-Type: " + part.type() + "\r\n\r\n";
            bytes.write(header.getBytes(StandardCharsets.UTF_8)); bytes.write(part.content()); bytes.write("\r\n".getBytes(StandardCharsets.UTF_8));
        }
        bytes.write(("--" + BOUNDARY + "--\r\n").getBytes(StandardCharsets.UTF_8));
        var request = HttpRequest.newBuilder(uri(path))
                .header("Content-Type", "multipart/form-data; boundary=" + BOUNDARY)
                .method(method, HttpRequest.BodyPublishers.ofByteArray(bytes.toByteArray()));
        if (credential != null) request.header("Authorization", "Bearer " + credential);
        if (version != null) request.header("If-Match", version);
        return send(request);
    }
    static List<Part> valid() {
        return new ArrayList<>(List.of(text("categoryId", "1"), text("title", "  Buraco na rua  "),
                text("description", "Descrição sintética do problema urbano."), text("neighborhood", "Centro"),
                text("reference", "Próximo à praça"), image(ImageFixtures.photo("png"), "image/png"), text("latitude", "-23.550520"), text("longitude", "-46.633308")));
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
        volatile boolean loseResponse;
        java.util.Set<String> objects = java.util.concurrent.ConcurrentHashMap.newKeySet();
        java.util.Set<String> deleted = java.util.concurrent.ConcurrentHashMap.newKeySet();
        volatile int failAt; volatile int loseAt; AtomicInteger calls = new AtomicInteger(); volatile boolean fail; volatile String lastKey; volatile byte[] lastBytes;
        @Override public StoredImage store(InputStream input, long length, String type) { throw new AssertionError("Prefix required"); }
        @Override public StoredImage store(InputStream input, long length, String type, String prefix) {
            int call = calls.incrementAndGet();
            if (fail || call == failAt) throw new ImageStorageException("provider secret should never leak");
            try { lastBytes = input.readAllBytes(); } catch (java.io.IOException exception) { throw new AssertionError(exception); }
            lastKey = prefix + "/" + UUID.randomUUID() + "." + (type.equals("image/jpeg") ? "jpg" : type.substring(6));
            return new StoredImage(lastKey);
        }
        @Override public void storeAt(String key, InputStream input, long length, String type) {
            store(input, length, type, "occurrences");
            lastKey = key;
            objects.add(key); contents.put(key, new StoredImageContent(lastBytes, lastBytes.length, type));
            if (loseResponse || calls.get() == loseAt) throw new ImageStorageException("Lost PUT response");
        }
        @Override public void delete(String key) { if (failDelete) throw new ImageStorageException("synthetic delete failure"); deleted.add(key); objects.remove(key); }
        final java.util.Map<String, StoredImageContent> contents = new java.util.concurrent.ConcurrentHashMap<>();
        volatile boolean failDelete;
        @Override public StoredImageContent load(String key) {
            if (fail) throw new ImageStorageException("synthetic provider failure");
            var image = contents.get(key);
            if (image == null || !objects.contains(key)) throw new ImageNotFoundException(key);
            return image;
        }
    }
}
