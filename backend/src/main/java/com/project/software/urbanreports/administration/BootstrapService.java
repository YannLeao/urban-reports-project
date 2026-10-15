package com.project.software.urbanreports.administration;

import com.project.software.urbanreports.identity.*;
import java.time.Clock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BootstrapService {
    private final UserAccountRepository accounts;
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final Clock clock;
    public BootstrapService(UserAccountRepository accounts, JdbcTemplate jdbc, PasswordEncoder encoder, Clock clock) {
        this.accounts = accounts; this.jdbc = jdbc; this.encoder = encoder; this.clock = clock;
    }
    @Transactional
    public void createFirst(String name, String email, String password) {
        AdminProvisioningService.validateIdentity(name, email);
        if (!PasswordPolicy.valid(password)) throw new AdministrationException(HttpStatus.BAD_REQUEST, "INVALID_PASSWORD");
        jdbc.queryForObject("SELECT id FROM administrative_bootstrap_guard WHERE id = 1 FOR UPDATE", Integer.class);
        if (accounts.existsByRole(AccountRole.SUPER_ADMIN)) throw new AdministrationException(HttpStatus.CONFLICT, "SUPER_ADMIN_EXISTS");
        String canonical = RegistrationValidation.canonicalEmail(email);
        if (accounts.findByEmail(canonical).isPresent()) throw new AdministrationException(HttpStatus.CONFLICT, "EMAIL_ALREADY_REGISTERED");
        accounts.saveAndFlush(UserAccount.firstSuperAdmin(RegistrationValidation.trim(name), canonical, encoder.encode(password), clock.instant()));
    }
}
