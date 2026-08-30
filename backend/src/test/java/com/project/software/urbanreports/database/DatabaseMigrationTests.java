package com.project.software.urbanreports.database;

import com.project.software.urbanreports.support.TestcontainersConfiguration;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class DatabaseMigrationTests {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private Flyway flyway;

    @Test
    void shouldApplyInitialMigrationAndPersistSchemaProbe() {
        var tableName = jdbcTemplate.queryForObject(
                "SELECT to_regclass('public.schema_probe')::text",
                String.class);

        var probeId = jdbcTemplate.queryForObject(
                "INSERT INTO schema_probe DEFAULT VALUES RETURNING id",
                Long.class);

        var checkedAt = jdbcTemplate.queryForObject(
                "SELECT checked_at FROM schema_probe WHERE id = ?",
                OffsetDateTime.class,
                probeId);

        var migrationApplied = jdbcTemplate.queryForObject("""
                SELECT success
                FROM flyway_schema_history
                WHERE version = '1' AND script = 'V1__create_schema_probe.sql'
                """, Boolean.class);

        assertThat(tableName).isEqualTo("schema_probe");
        assertThat(probeId).isPositive();
        assertThat(checkedAt).isNotNull();
        assertThat(migrationApplied).isTrue();
    }

    @Test
    void shouldNotReapplyMigrationWhenSchemaIsUpToDate() {
        var historyCountBefore = migrationHistoryCount();

        var migrationResult = flyway.migrate();

        assertThat(migrationResult.migrationsExecuted).isZero();
        assertThat(migrationHistoryCount()).isEqualTo(historyCountBefore);
    }

    private Long migrationHistoryCount() {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM flyway_schema_history WHERE version = '1'",
                Long.class);
    }
}

