package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.storage.application.*;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.time.*;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {"spring.config.import=", "spring.profiles.active=", "image.storage.endpoint=", "image.recovery.enabled=false"})
@Import(TestcontainersConfiguration.class)
class UploadRecoveryTests {
    @Autowired UploadJournal journal;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager manager;
    @MockitoBean ImageStorageService images;
    @MockitoBean Clock clock;
    Instant now = Instant.parse("2026-09-30T12:00:00Z");
    String key;
    @BeforeEach void setup() {
        jdbc.update("delete from image_upload_journal");
        when(clock.instant()).thenAnswer(call -> now);
        key = "occurrences/" + UUID.randomUUID() + ".png";
        journal.record(key);
    }
    void due() { now = now.plusSeconds(301); }
    String state() { return jdbc.queryForObject("select state from image_upload_journal where image_key = ?", String.class, key); }

    @Test void rollbackAndLostUploadResponseRemainRecoverableAfterRestart() {
        assertThatThrownBy(() -> journal.link(key, () -> { throw new ImageStorageException("uncertain PUT"); }))
                .isInstanceOf(ImageStorageException.class);
        assertThat(state()).isEqualTo("PENDING");
        due();
        new UploadJournal(jdbc, manager, images, clock, Duration.ofMinutes(5), 20).recover();
        verify(images).delete(key);
        assertThat(state()).isEqualTo("TOMBSTONE");
        now = now.plusSeconds(3601); journal.recover();
        verify(images, times(2)).delete(key);
    }

    @Test void deletionFailureUsesDurableSanitizedBackoff() {
        doThrow(new ImageStorageException("secret provider URL")).doNothing().when(images).delete(key);
        due(); journal.recover();
        assertThat(state()).isEqualTo("TOMBSTONE");
        assertThatThrownBy(() -> journal.link(key, () -> "late")).isInstanceOf(ImageStorageException.class);
        assertThat(jdbc.queryForObject("select last_error from image_upload_journal where image_key = ?", String.class, key))
                .isEqualTo("DELETE_FAILED");
        journal.recover(); verify(images, times(1)).delete(key);
        now = now.plusSeconds(61); journal.recover();
        assertThat(state()).isEqualTo("TOMBSTONE");
    }

    @Test void deferredConstraintFailureAtCommitLeavesIndependentIntent() {
        String table = "commit_probe_" + UUID.randomUUID().toString().replace("-", "");
        jdbc.execute("create table " + table + " (id integer unique deferrable initially deferred)");
        try {
            assertThatThrownBy(() -> journal.link(key, () -> {
                jdbc.update("insert into " + table + " values (1), (1)");
                return "callback completed";
            })).isInstanceOf(RuntimeException.class);
            assertThat(state()).isEqualTo("PENDING");
            assertThat(jdbc.queryForObject("select count(*) from " + table, Integer.class)).isZero();
            due(); journal.recover(); verify(images).delete(key);
        } finally { jdbc.execute("drop table " + table); }
    }

    @Test void activeUploadIsSkippedAndConfirmedCommitSurvivesLostHttpResponse() throws Exception {
        CountDownLatch locked = new CountDownLatch(1), finish = new CountDownLatch(1);
        try (var executor = Executors.newSingleThreadExecutor()) {
            var active = executor.submit(() -> journal.link(key, () -> {
                locked.countDown();
                try { if (!finish.await(10, TimeUnit.SECONDS)) throw new AssertionError("Timed out"); }
                catch (InterruptedException exception) { throw new AssertionError(exception); }
                return "committed response discarded";
            }));
            assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
            due(); journal.recover(); verifyNoInteractions(images);
            finish.countDown(); assertThat(active.get(10, TimeUnit.SECONDS)).isEqualTo("committed response discarded");
        } finally { finish.countDown(); }
        journal.recover(); verifyNoInteractions(images);
        assertThat(state()).isEqualTo("LINKED");
    }

    @Test void reclaimedIntentCannotBeLinkedByDelayedWriter() {
        due(); journal.recover();
        assertThatThrownBy(() -> journal.link(key, () -> "late writer" )).isInstanceOf(ImageStorageException.class);
    }
}
