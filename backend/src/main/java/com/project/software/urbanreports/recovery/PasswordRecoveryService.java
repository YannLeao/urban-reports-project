package com.project.software.urbanreports.recovery;

import com.project.software.urbanreports.auth.SessionRevocation;
import com.project.software.urbanreports.identity.*;
import com.project.software.urbanreports.email.*;
import java.time.Clock;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@Transactional(propagation = Propagation.NEVER)
public class PasswordRecoveryService {
    private final UserAccountRepository accounts;
    private final PasswordRecoveryTokens tokens;
    private final PasswordRecoveryMailSender mail;
    private final SessionRevocation revocation;
    private final PasswordEncoder encoder;
    private final Clock clock;
    private final TransactionTemplate transaction;
    private final RecoverySettings settings;
    private final RecoveryDelivery delivery;
    private final RecoveryLimits limits;
    private final boolean configured;

    public PasswordRecoveryService(UserAccountRepository accounts, PasswordRecoveryTokens tokens,
            PasswordRecoveryMailSender mail, SessionRevocation revocation, PasswordEncoder encoder, Clock clock,
            PlatformTransactionManager manager, RecoverySettings settings, RecoveryDelivery delivery,
            RecoveryLimits limits, RecoveryDiagnostics diagnostics) {
        this.accounts = accounts; this.tokens = tokens; this.mail = mail; this.revocation = revocation;
        this.encoder = encoder; this.clock = clock;
        this.transaction = new TransactionTemplate(manager);
        this.settings = settings; this.delivery = delivery; this.limits = limits;
        boolean valid = settings.origin != null;
        try { mail.validateConfiguration(); } catch (RuntimeException invalid) { valid = false; }
        this.configured = valid;
        if (!valid) diagnostics.failure(new EmailObservation(EmailObservation.Operation.PASSWORD_RECOVERY),
                EmailObservation.Stage.PREPARATION, EmailSendException.Category.CONFIGURATION,
                EmailObservation.Reason.recovery_configuration_invalid);
    }

    private record Prepared(UUID accountId, String email, String token) {
        @Override public String toString() { return "PreparedRecovery[redacted]"; }
    }

    /** Same admission path for every syntactically valid email, before looking up eligibility. */
    public void request(String email, String trafficOrigin) {
        if (!RegistrationValidation.validEmail(email))
            throw new PasswordRecoveryException(HttpStatus.BAD_REQUEST, "INVALID_EMAIL");
        String canonical = RegistrationValidation.canonicalEmail(email);
        if (!limits.request(canonical, trafficOrigin) || !configured) return;
        var reservation = delivery.reserve();
        if (reservation == null) return;
        boolean submitted = false;
        try {
            // Resolve only the ID before the locked read: do not reuse a stale managed account.
            UUID id = accounts.findByEmail(canonical).map(UserAccount::getId).orElse(null);
            var prepared = id == null ? null : transaction.execute(status -> accounts.lockById(id)
                    .filter(UserAccount::isActive)
                    .map(account -> new Prepared(account.getId(), account.getEmail(),
                            tokens.replace(account.getId(), clock.instant())))
                    .orElse(null));
            // TransactionTemplate has returned only after successful commit. Any failure releases
            // the reservation in finally and cannot submit a delivery callback.
            if (prepared != null) {
                var observation = new EmailObservation(EmailObservation.Operation.PASSWORD_RECOVERY);
                delivery.submit(reservation, observation, () -> deliver(prepared, observation));
                submitted = true;
            }
        } finally { if (!submitted) reservation.close(); }
    }

    public void checkResetLimit(String trafficOrigin) {
        if (!limits.reset(trafficOrigin))
            throw new PasswordRecoveryException(HttpStatus.TOO_MANY_REQUESTS, "RECOVERY_RATE_LIMITED");
    }

    public void reset(String raw, String password) {
        if (!PasswordPolicy.valid(password)) throw new PasswordRecoveryException(HttpStatus.BAD_REQUEST, "INVALID_PASSWORD");
        UUID id = tokens.locate(raw).orElseThrow(PasswordRecoveryService::invalidLink);
        String hash = encoder.encode(password); // custo do Argon2 fora do lock
        transaction.executeWithoutResult(status -> {
            var account = accounts.lockById(id).orElseThrow(PasswordRecoveryService::invalidLink);
            var now = clock.instant();
            // Revalida sob lock: conta elegível e token ainda válido (consume faz o UPDATE condicional).
            if (!account.isActive() || !tokens.consume(id, raw, now)) throw invalidLink();
            account.changePasswordHash(hash, now);
            revocation.revokeAllSessions(id, now);
            accounts.flush();
        });
    }

    private void deliver(Prepared prepared, EmailObservation observation) {
        // One short read ends before HTTP. A subsequent request can still replace the link during HTTP.
        boolean current = Boolean.TRUE.equals(transaction.execute(status ->
                tokens.isCurrent(prepared.accountId(), prepared.token(), clock.instant())));
        if (current) mail.send(prepared.email(), settings.origin + "/redefinir-senha#token=" + prepared.token(),
                observation);
    }

    private static PasswordRecoveryException invalidLink() {
        return new PasswordRecoveryException(HttpStatus.BAD_REQUEST, "INVALID_RECOVERY_LINK");
    }
}