package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint=", "image.recovery.enabled=false"})
@Import(TestcontainersConfiguration.class)
class MediaMigrationTests {
    @Autowired Flyway flyway;
    @Autowired JdbcTemplate jdbc;
    @Test void upgradesV12WithoutProviderCallsAndPreservesJournalAndUnknownMetadata() {
        String schema = "media_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var source = flyway.getConfiguration().getDataSource();
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("12").load().migrate();
        UUID author = UUID.randomUUID(); String key = "occurrences/" + UUID.randomUUID() + ".png";
        jdbc.update("INSERT INTO " + schema + ".user_accounts(id,name,email,password_hash,role,created_at,updated_at) VALUES (?, 'Pessoa', 'media@example.com', 'hash', 'USER', now(), now())", author);
        UUID first = UUID.randomUUID(), ambiguous = UUID.randomUUID();
        for (UUID id : java.util.List.of(first, ambiguous)) jdbc.update("INSERT INTO " + schema + ".occurrences(id,author_id,category_id,title,neighborhood,reference,image_key,created_at) VALUES (?, ?, 1, 'Poste apagado', 'Centro', 'Praça central', ?, now())", id, author, id.equals(first) ? key : "historical-unknown-key");
        jdbc.update("INSERT INTO " + schema + ".image_upload_journal(image_key,state,created_at,next_attempt_at) VALUES (?, 'LINKED', now(), now())", key);
        var upgraded = Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(1);
        var row = jdbc.queryForMap("SELECT * FROM " + schema + ".occurrence_media WHERE occurrence_id=?", first);
        assertThat(row).containsEntry("object_key", key).containsEntry("position", 0).containsEntry("kind", "IMAGE")
                .containsEntry("content_type", "image/png").containsEntry("size_bytes", null);
        assertThat(jdbc.queryForMap("SELECT * FROM " + schema + ".occurrence_media WHERE occurrence_id=?", ambiguous))
                .containsEntry("object_key", "historical-unknown-key").containsEntry("content_type", null).containsEntry("size_bytes", null);
        assertThat(jdbc.queryForObject("SELECT state FROM " + schema + ".image_upload_journal WHERE image_key=?", String.class, key)).isEqualTo("LINKED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".occurrence_media", Integer.class)).isEqualTo(2);
        assertThat(upgraded.migrate().migrationsExecuted).isZero();
        assertThat(jdbc.queryForMap("SELECT * FROM " + schema + ".occurrences WHERE id=?", first)).doesNotContainKey("image_key");
    }
}
