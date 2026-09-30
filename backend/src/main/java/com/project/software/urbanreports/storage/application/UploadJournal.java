package com.project.software.urbanreports.storage.application;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class UploadJournal {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final ImageStorageService images;
    private final Clock clock;
    private final Duration safetyDelay;
    private final int batchSize;

    public UploadJournal(JdbcTemplate jdbc, PlatformTransactionManager manager, ImageStorageService images,
            Clock clock, @Value("${image.recovery.safety-delay:PT5M}") Duration safetyDelay,
            @Value("${image.recovery.batch-size:20}") int batchSize) {
        if (safetyDelay.compareTo(Duration.ofMinutes(2)) < 0 || batchSize < 1 || batchSize > 100)
            throw new IllegalArgumentException("Invalid upload recovery configuration");
        this.jdbc = jdbc; this.images = images; this.clock = clock;
        this.safetyDelay = safetyDelay; this.batchSize = batchSize;
        transaction = new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public void record(String key) {
        transaction.executeWithoutResult(status -> jdbc.update(
                "insert into image_upload_journal(image_key, created_at, next_attempt_at) values (?, ?, ?)",
                key, Timestamp.from(clock.instant()), Timestamp.from(clock.instant().plus(safetyDelay))));
    }

    public <T> T link(String key, Supplier<T> creation) {
        // execute returns after commit, including failures outside the callback.
        return transaction.execute(status -> {
            String state = jdbc.queryForObject(
                    "select state from image_upload_journal where image_key = ? for update", String.class, key);
            if (!"PENDING".equals(state)) throw new ImageStorageException("Upload intent is no longer writable");
            T result = creation.get();
            jdbc.update("update image_upload_journal set state = 'LINKED', last_error = null where image_key = ?", key);
            return result;
        });
    }

    public void recover() {
        transaction.executeWithoutResult(status -> {
            var keys = jdbc.queryForList("""
                    select image_key from image_upload_journal where state <> 'LINKED' and next_attempt_at <= ?
                    order by next_attempt_at, image_key limit ? for update skip locked
                    """, String.class, Timestamp.from(clock.instant()), batchSize);
            for (String key : keys) {
                if (Boolean.TRUE.equals(jdbc.queryForObject(
                        "select exists(select 1 from occurrences where image_key = ?)", Boolean.class, key))) {
                    jdbc.update("update image_upload_journal set state = 'LINKED', last_error = null where image_key = ?", key);
                    continue;
                }
                int attempts = jdbc.queryForObject("select attempts from image_upload_journal where image_key = ?", Integer.class, key);
                String error = null;
                try { images.delete(key); }
                catch (RuntimeException failure) { error = "DELETE_FAILED"; }
                // Recheck tombstones forever to catch a provider PUT completing after an uncertain response.
                long delay = error == null ? 3600 : Math.min(3600, 60L << Math.min(attempts, 6));
                jdbc.update("""
                        update image_upload_journal set state = ?, attempts = least(attempts + 1, 2147483646),
                        next_attempt_at = ?, last_error = ? where image_key = ?
                        """, "TOMBSTONE",
                        Timestamp.from(clock.instant().plusSeconds(delay)), error, key);
            }
        });
    }
}
