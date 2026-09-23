package com.project.software.urbanreports.identity;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RegistrationService {
    private final UserAccountRepository accounts;
    private final PasswordEncoder encoder;

    public RegistrationService(UserAccountRepository accounts, PasswordEncoder encoder) {
        this.accounts = accounts;
        this.encoder = encoder;
    }

    @Transactional
    public RegistrationResponse register(RegistrationRequest input) {
        var validated = RegistrationValidation.validate(input);
        var account = new UserAccount(validated.name(), validated.email(), encoder.encode(validated.password()));
        accounts.saveAndFlush(account);
        return account.response();
    }
}
