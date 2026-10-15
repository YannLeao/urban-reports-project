package com.project.software.urbanreports.administration;

import com.project.software.urbanreports.auth.*;
import com.project.software.urbanreports.identity.*;
import java.net.URI;
import java.time.Clock;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@Transactional(propagation = Propagation.NEVER)
public class AdminProvisioningService {
    private final UserAccountRepository accounts;
    private final AccountAccess access;
    private final AdminActivationTokens tokens;
    private final ActivationMailSender mail;
    private final SessionRevocation revocation;
    private final PasswordEncoder encoder;
    private final Clock clock;
    private final TransactionTemplate transaction;
    private final String frontendOrigin;
    public AdminProvisioningService(UserAccountRepository accounts, AccountAccess access, AdminActivationTokens tokens,
            ActivationMailSender mail, SessionRevocation revocation, PasswordEncoder encoder, Clock clock,
            PlatformTransactionManager manager, @Value("${admin.frontend-origin:}") String frontendOrigin) {
        this.accounts = accounts; this.access = access; this.tokens = tokens; this.mail = mail;
        this.revocation = revocation; this.encoder = encoder; this.clock = clock;
        this.transaction = new TransactionTemplate(manager); this.frontendOrigin = frontendOrigin;
    }
    public record Admin(UUID id, String name, String email, AccountStatus status, java.time.Instant createdAt) {
        static Admin from(UserAccount account) { return new Admin(account.getId(), account.getName(), account.getEmail(), account.getStatus(), account.getCreatedAt()); }
    }
    public record AdminPage(List<Admin> items, int page, int size, long totalItems, int totalPages) {}
    public record Invitation(Admin admin, String mailStatus) {}
    private record Prepared(Admin admin, String token) {
        @Override public String toString() { return "PreparedInvitation[redacted]"; }
    }
    public AdminPage list(AuthenticatedIdentity actor, int page, int size) {
        return transaction.execute(status -> {
            access.lock(actor, AccountRole.SUPER_ADMIN);
            checkPage(page, size);
            var result = accounts.findByRole(AccountRole.ADMIN, PageRequest.of(page, size, Sort.by("createdAt", "id")));
            return new AdminPage(result.map(Admin::from).getContent(), page, size, result.getTotalElements(), result.getTotalPages());
        });
    }
    public Invitation create(AuthenticatedIdentity actor, String name, String email) {
        var prepared = transaction.execute(status -> {
            access.lock(actor, AccountRole.SUPER_ADMIN);
            validateIdentity(name, email);
            String canonical = RegistrationValidation.canonicalEmail(email);
            if (accounts.findByEmail(canonical).isPresent()) throw conflict("EMAIL_ALREADY_REGISTERED");
            var now = clock.instant();
            var account = accounts.saveAndFlush(UserAccount.pendingAdmin(RegistrationValidation.trim(name), canonical, now));
            return new Prepared(Admin.from(account), tokens.replace(account.getId(), now));
        });
        return send(Objects.requireNonNull(prepared));
    }
    public Invitation resend(AuthenticatedIdentity actor, UUID id) {
        var prepared = transaction.execute(status -> {
            access.lock(actor, AccountRole.SUPER_ADMIN, id);
            var account = access.admin(id);
            if (account.getStatus() != AccountStatus.PENDING_ACTIVATION) throw conflict("ADMIN_NOT_PENDING");
            return new Prepared(Admin.from(account), tokens.replace(id, clock.instant()));
        });
        return send(Objects.requireNonNull(prepared));
    }
    public Admin deactivate(AuthenticatedIdentity actor, UUID id) {
        return transaction.execute(status -> {
            access.lock(actor, AccountRole.SUPER_ADMIN, id);
            var account = access.admin(id);
            if (account.getStatus() != AccountStatus.DISABLED) {
                var now = clock.instant();
                account.disableAdmin(now); tokens.invalidate(id, now); revocation.revokeAllSessions(id, now);
                accounts.flush();
            }
            return Admin.from(account);
        });
    }
    public void activate(String raw, String password) {
        UUID id = tokens.locate(raw).orElseThrow(AdminProvisioningService::invalidLink);
        transaction.executeWithoutResult(status -> {
            var account = accounts.lockById(id).orElseThrow(AdminProvisioningService::invalidLink);
            if (account.getRole() != AccountRole.ADMIN || account.getStatus() != AccountStatus.PENDING_ACTIVATION
                    || !tokens.valid(id, raw, clock.instant())) throw invalidLink();
        });
        if (!PasswordPolicy.valid(password)) throw new AdministrationException(HttpStatus.BAD_REQUEST, "INVALID_PASSWORD");
        String hash = encoder.encode(password);
        transaction.executeWithoutResult(status -> {
            var account = accounts.lockById(id).orElseThrow(AdminProvisioningService::invalidLink);
            var now = clock.instant();
            if (account.getRole() != AccountRole.ADMIN || account.getStatus() != AccountStatus.PENDING_ACTIVATION
                    || !tokens.consume(id, raw, now)) throw invalidLink();
            account.activateAdmin(hash, now); accounts.flush();
        });
    }
    private Invitation send(Prepared prepared) {
        try {
            URI uri = URI.create(frontendOrigin);
            boolean local = "localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost());
            if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                    || uri.getRawPath() != null && !uri.getRawPath().isEmpty()
                    || !("https".equals(uri.getScheme()) || local && "http".equals(uri.getScheme()))) throw new IllegalArgumentException();
            mail.send(prepared.admin.email(), uri + "/ativar-administrador#token=" + prepared.token());
            return new Invitation(prepared.admin(), "ACCEPTED");
        } catch (RuntimeException failure) {
            // Do not log the exception: a provider may include the message/link.
            return new Invitation(prepared.admin(), "FAILED");
        }
    }
    static void validateIdentity(String name, String email) {
        if (!RegistrationValidation.validName(name) || email == null || !RegistrationValidation.validEmail(email))
            throw new AdministrationException(HttpStatus.BAD_REQUEST, "INVALID_IDENTITY");
    }
    public static void checkPage(int page, int size) {
        if (page < 0 || size < 1 || size > 50) throw new AdministrationException(HttpStatus.BAD_REQUEST, "INVALID_PAGE");
    }
    private static AdministrationException conflict(String code) { return new AdministrationException(HttpStatus.CONFLICT, code); }
    private static AdministrationException invalidLink() { return new AdministrationException(HttpStatus.BAD_REQUEST, "INVALID_ACTIVATION_LINK"); }
}
