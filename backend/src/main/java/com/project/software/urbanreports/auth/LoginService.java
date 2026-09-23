package com.project.software.urbanreports.auth;

import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import com.project.software.urbanreports.identity.*;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Service
public class LoginService {
    private final UserAccountRepository accounts;
    private final AuthSessionRepository sessions;
    private final PasswordEncoder encoder;
    private final JwtEncoder jwtEncoder;
    private final JwtConfiguration.Settings settings;
    private final Clock clock;
    private final TransactionTemplate transaction;
    private final String dummyHash;
    public LoginService(UserAccountRepository accounts, AuthSessionRepository sessions, PasswordEncoder encoder,
            JwtEncoder jwtEncoder, JwtConfiguration.Settings settings, Clock clock, PlatformTransactionManager manager) {
        this.accounts = accounts; this.sessions = sessions; this.encoder = encoder;
        this.jwtEncoder = jwtEncoder; this.settings = settings; this.clock = clock;
        this.transaction = new TransactionTemplate(manager);
        this.dummyHash = encoder.encode(UUID.randomUUID().toString());
    }
    public record Result(String accessToken, String tokenType, Instant expiresAt, RegistrationResponse user) {
        @Override public String toString() { return "LoginResult[redacted]"; }
    }
    @org.springframework.transaction.annotation.Transactional(propagation = org.springframework.transaction.annotation.Propagation.NEVER)
    public Result login(String email, String password) {
        var candidate = accounts.findByEmail(RegistrationValidation.canonicalEmail(email));
        String hash = candidate.map(UserAccount::getPasswordHash).orElse(dummyHash);
        boolean matches = encoder.matches(password, hash);
        if (candidate.isEmpty() || !matches) throw invalid();
        UUID userId = candidate.get().getId();
        // The expensive hash check is outside the lock. A fresh locked read detects a concurrent reset.
        var issued = transaction.execute(status -> {
            var account = accounts.lockById(userId).orElseThrow(() -> invalid());
            if (!hash.equals(account.getPasswordHash())) throw invalid();
            var session = sessions.saveAndFlush(new AuthSession(userId, clock.instant().truncatedTo(ChronoUnit.SECONDS)));
            var claims = JwtClaimsSet.builder().issuer(settings.issuer()).audience(List.of(settings.audience()))
                    .subject(userId.toString()).id(session.getId().toString()).issuedAt(session.getCreatedAt())
                    .expiresAt(session.getExpiresAt()).build();
            var token = jwtEncoder.encode(JwtEncoderParameters.from(
                    JwsHeader.with(SignatureAlgorithm.RS256).keyId(settings.keyId()).build(), claims));
            return new Result(token.getTokenValue(), "Bearer", session.getExpiresAt(), account.response());
        });
        // TransactionTemplate commits before any credential leaves this service.
        return Objects.requireNonNull(issued);
    }
    private static BadCredentialsException invalid() { return new BadCredentialsException("Invalid credentials"); }
}
