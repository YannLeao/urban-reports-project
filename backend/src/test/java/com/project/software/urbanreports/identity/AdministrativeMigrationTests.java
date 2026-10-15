package com.project.software.urbanreports.identity;

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
class AdministrativeMigrationTests {
    @Autowired Flyway flyway;
    @Autowired JdbcTemplate jdbc;
    @Test void v8PreservesActiveCitizensAndExistingHistorySchema() {
        String schema = "admin_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var source = flyway.getConfiguration().getDataSource();
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("7").load().migrate();
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO " + schema + ".user_accounts VALUES (?, 'Pessoa teste', 'existing@example.com', 'existing-hash', 'USER', now(), now())", id);
        var latest = Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("8").load();
        assertThat(latest.migrate().migrationsExecuted).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT status FROM " + schema + ".user_accounts WHERE id = ?", String.class, id)).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("SELECT password_hash FROM " + schema + ".user_accounts WHERE id = ?", String.class, id)).isEqualTo("existing-hash");
        assertThat(latest.migrate().migrationsExecuted).isZero();
    }
}
