package com.project.software.urbanreports.administration;

import com.project.software.urbanreports.auth.*;
import com.project.software.urbanreports.identity.*;
import java.time.Clock;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

@Component
public class AccountAccess {
    private final UserAccountRepository accounts;
    private final AuthSessionRepository sessions;
    private final Clock clock;
    public AccountAccess(UserAccountRepository accounts, AuthSessionRepository sessions, Clock clock) {
        this.accounts = accounts; this.sessions = sessions; this.clock = clock;
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public UserAccount lock(AuthenticatedIdentity identity, AccountRole required, UUID... related) {
        if (identity == null) throw new AccessDeniedException("Access denied");
        var ids = new TreeSet<UUID>(Comparator.comparing(UUID::toString));
        ids.add(identity.userId()); ids.addAll(Arrays.asList(related));
        Map<UUID, UserAccount> locked = new HashMap<>();
        for (UUID id : ids) accounts.lockById(id).ifPresent(account -> locked.put(id, account));
        var actor = locked.get(identity.userId());
        if (actor == null || !actor.isActive() || actor.getRole() != required)
            throw new AccessDeniedException("Access denied");
        var session = sessions.findById(identity.sessionId()).orElseThrow(() -> new AccessDeniedException("Access denied"));
        if (!session.getUserId().equals(actor.getId()) || !session.active(clock.instant()))
            throw new AccessDeniedException("Access denied");
        return actor;
    }
    public UserAccount admin(UUID id) {
        return accounts.findById(id).filter(account -> account.getRole() == AccountRole.ADMIN)
                .orElseThrow(() -> new AdministrationException(HttpStatus.NOT_FOUND, "ADMIN_NOT_FOUND"));
    }
}
