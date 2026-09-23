package com.project.software.urbanreports.auth;

import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class SessionRevocation {
    private final AuthSessionRepository sessions;
    public SessionRevocation(AuthSessionRepository sessions) { this.sessions = sessions; }

    /** Caller must lock the account before updating its hash and invoking this operation. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void revokeAllSessions(UUID userId, Instant instant) { sessions.revokeAll(userId, instant); }
}
