package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint=", "image.recovery.enabled=false"})
@Import(TestcontainersConfiguration.class)
class OccurrenceStatusMigrationTests {
    @Autowired Flyway flyway;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;

    @Test void upgradesPopulatedV15PreservingEveryLegacyTransitionAndNotification() {
        String schema = "status_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var source = flyway.getConfiguration().getDataSource();
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("15").load().migrate();
        UUID author = UUID.randomUUID();
        UUID analyzing = UUID.randomUUID(), resolved = UUID.randomUUID(), rejected = UUID.randomUUID();
        UUID directRejected = UUID.randomUUID(), pending = UUID.randomUUID();
        var tx = new TransactionTemplate(transactions);
        tx.executeWithoutResult(status -> {
            jdbc.execute("SET LOCAL search_path TO " + schema);
            jdbc.update("""
                    INSERT INTO user_accounts(id,name,email,password_hash,role,created_at,updated_at)
                    VALUES (?, 'Pessoa', 'status@example.com', 'hash', 'USER', now(), now())
                    """, author);
            for (UUID report : List.of(analyzing, resolved, rejected, directRejected, pending)) {
                jdbc.update("""
                        INSERT INTO occurrences(id,author_id,category_id,title,neighborhood,reference,created_at)
                        VALUES (?, ?, 1, 'Poste apagado', 'Centro', 'Praça central', now())
                        """, report, author);
                jdbc.update("""
                        INSERT INTO occurrence_media(id,occurrence_id,object_key,kind,position)
                        VALUES (?, ?, ?, 'IMAGE', 0)
                        """, UUID.randomUUID(), report, "occurrences/" + UUID.randomUUID() + ".png");
            }
            for (UUID report : List.of(analyzing, resolved, rejected))
                append(report, author, "PENDING", "IN_ANALYSIS", null, 1);
            append(resolved, author, "IN_ANALYSIS", "RESOLVED", null, 2);
            append(rejected, author, "IN_ANALYSIS", "REJECTED", "Justificativa antiga", 2);
            append(directRejected, author, "PENDING", "REJECTED", "Rejeição direta antiga", 1);
            jdbc.update("UPDATE occurrences SET status = 'IN_ANALYSIS', version = 1 WHERE id = ?", analyzing);
            jdbc.update("UPDATE occurrences SET status = 'RESOLVED', version = 2 WHERE id = ?", resolved);
            jdbc.update("UPDATE occurrences SET status = 'REJECTED', version = 2 WHERE id = ?", rejected);
            jdbc.update("UPDATE occurrences SET status = 'REJECTED', version = 1 WHERE id = ?", directRejected);
        });
        var preservedTables = List.of("occurrence_history", "occurrence_notification_outbox",
                "occurrence_notifications", "occurrence_notification_email_deliveries");
        var before = preservedTables.stream().map(table -> jdbc.queryForList("SELECT * FROM " + schema + "." + table + " ORDER BY 1")).toList();
        var upgraded = Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(1);
        for (int i = 0; i < preservedTables.size(); i++)
            assertThat(jdbc.queryForList("SELECT * FROM " + schema + "." + preservedTables.get(i) + " ORDER BY 1")).isEqualTo(before.get(i));
        assertThat(jdbc.queryForObject("SELECT status FROM " + schema + ".occurrences WHERE id = ?", String.class, analyzing)).isEqualTo("ACCEPTED");
        assertThat(jdbc.queryForObject("SELECT version FROM " + schema + ".occurrences WHERE id = ?", Long.class, analyzing)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT status FROM " + schema + ".occurrences WHERE id = ?", String.class, pending)).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("SELECT status FROM " + schema + ".occurrences WHERE id = ?", String.class, resolved)).isEqualTo("RESOLVED");
        for (UUID report : List.of(rejected, directRejected))
            assertThat(jdbc.queryForObject("SELECT status FROM " + schema + ".occurrences WHERE id = ?", String.class, report)).isEqualTo("REJECTED");
        assertThat(upgraded.migrate().migrationsExecuted).isZero();
        upgraded.validate();

        tx.executeWithoutResult(status -> {
            jdbc.execute("SET LOCAL search_path TO " + schema);
            append(pending, author, "PENDING", "ACCEPTED", "Comentário de aceite", 1);
            append(pending, author, "ACCEPTED", "RESOLVED", null, 2);
        });
        assertThat(jdbc.queryForObject("SELECT n.message FROM " + schema + ".occurrence_notifications n JOIN " + schema + ".occurrence_history h ON h.id = n.event_id WHERE h.occurrence_id = ? AND h.new_status = 'ACCEPTED'", String.class, pending))
                .contains("aceita: Comentário de aceite");
        for (String[] invalid : new String[][] {
                {"ACCEPTED", "REJECTED", "Rejeição inválida"},
                {"PENDING", "ACCEPTED", null}, {"PENDING", "ACCEPTED", "curto"}}) {
            assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
                jdbc.execute("SET LOCAL search_path TO " + schema);
                append(pending, author, invalid[0], invalid[1], invalid[2], 3);
            })).isInstanceOf(DataAccessException.class);
        }
        assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".occurrence_history SET reason = 'Outro comentário'"))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM " + schema + ".occurrence_history"))
                .isInstanceOf(DataAccessException.class);
    }

    private void append(UUID report, UUID moderator, String previous, String next, String reason, long version) {
        jdbc.update("""
                INSERT INTO occurrence_history(id,occurrence_id,previous_status,new_status,moderator_id,occurred_at,reason,version)
                VALUES (?, ?, ?, ?, ?, now(), ?, ?)
                """, UUID.randomUUID(), report, previous, next, moderator, reason, version);
    }
}
