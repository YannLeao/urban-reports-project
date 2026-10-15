package com.project.software.urbanreports.identity;

import com.project.software.urbanreports.administration.*;
import com.project.software.urbanreports.auth.LoginService;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint=", "spring.application.name=bootstrap-tests"})
@Import(TestcontainersConfiguration.class)
class BootstrapIntegrationTests {
    @Autowired BootstrapService bootstrap;
    @Autowired RegistrationService registration;
    @Autowired UserAccountRepository accounts;
    @Autowired LoginService login;
    @Autowired JdbcTemplate jdbc;
    @Test void bootstrapIsExplicitUniqueAndNeverPromotesOrResets() throws Exception {
        String password = "synthetic bootstrap long password";
        var citizen = registration.register(new RegistrationRequest("Pessoa cidadã", "occupied@example.com", password));
        assertThatThrownBy(() -> bootstrap.createFirst("Responsável", citizen.email(), password)).isInstanceOf(AdministrationException.class);
        assertThat(accounts.findById(citizen.id()).orElseThrow().getRole()).isEqualTo(AccountRole.USER);
        assertThatThrownBy(() -> bootstrap.createFirst("Responsável", "root@example.com", "weak")).isInstanceOf(AdministrationException.class);
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var one = executor.submit(() -> attempt(gate, "first@example.com", password));
            var two = executor.submit(() -> attempt(gate, "second@example.com", password));
            gate.countDown();
            assertThat(List.of(one.get(20, TimeUnit.SECONDS), two.get(20, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        String email = jdbc.queryForObject("SELECT email FROM user_accounts WHERE role = 'SUPER_ADMIN'", String.class);
        assertThatThrownBy(() -> bootstrap.createFirst("Outro nome", email, "another synthetic password long"))
                .isInstanceOfSatisfying(AdministrationException.class, error -> assertThat(error.code).isEqualTo("SUPER_ADMIN_EXISTS"));
        assertThat(login.login(email, password).user().role()).isEqualTo(AccountRole.SUPER_ADMIN);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_accounts WHERE role = 'SUPER_ADMIN'", Integer.class)).isEqualTo(1);
    }
    private boolean attempt(CountDownLatch gate, String email, String password) throws Exception {
        gate.await(); try { bootstrap.createFirst("Responsável", email, password); return true; } catch (AdministrationException conflict) { return false; }
    }
}
