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

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint="})
@Import(TestcontainersConfiguration.class)
class LocationMigrationTests {
    @Autowired Flyway flyway;
    @Autowired JdbcTemplate jdbc;

    @Test void upgradingV8PreservesLegacyAndEnforcesCompleteFinitePair() {
        String schema = "location_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var source = flyway.getConfiguration().getDataSource();
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("8").load().migrate();
        UUID author = UUID.randomUUID(), report = UUID.randomUUID();
        jdbc.update("INSERT INTO " + schema + ".user_accounts(id, name, email, password_hash, role, status, created_at, updated_at) VALUES (?, 'Pessoa teste', 'location@example.com', 'test-hash', 'USER', 'ACTIVE', now(), now())", author);
        jdbc.update("INSERT INTO " + schema + ".occurrences(id, author_id, category_id, title, neighborhood, reference, image_key, created_at, version) VALUES (?, ?, 1, 'Poste apagado', 'Centro', 'Praça central', 'occurrences/location.png', now(), 4)", report, author);
        var upgraded = Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("9").load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(1);
        var row = jdbc.queryForMap("SELECT * FROM " + schema + ".occurrences WHERE id = ?", report);
        assertThat(row).containsEntry("latitude", null).containsEntry("longitude", null).containsEntry("version", 4L)
                .containsEntry("title", "Poste apagado").containsEntry("image_key", "occurrences/location.png");
        for (String assignment : new String[]{"latitude = 0", "longitude = 0", "latitude = 91, longitude = 0",
                "latitude = 0, longitude = -181", "latitude = 'NaN', longitude = 0", "latitude = 0, longitude = 'Infinity'",
                "latitude = '-Infinity', longitude = 0"}) {
            assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".occurrences SET " + assignment + " WHERE id = ?", report))
                    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        }
        for (double[] point : new double[][]{{90, 180}, {-90, -180}, {0, 0}, {-23.550520123456, -46.633308987654}}) {
            jdbc.update("UPDATE " + schema + ".occurrences SET latitude = ?, longitude = ? WHERE id = ?", point[0], point[1], report);
            assertThat(jdbc.queryForObject("SELECT latitude FROM " + schema + ".occurrences WHERE id = ?", Double.class, report)).isEqualTo(point[0]);
            assertThat(jdbc.queryForObject("SELECT longitude FROM " + schema + ".occurrences WHERE id = ?", Double.class, report)).isEqualTo(point[1]);
        }
        assertThat(upgraded.migrate().migrationsExecuted).isZero();
    }
}
