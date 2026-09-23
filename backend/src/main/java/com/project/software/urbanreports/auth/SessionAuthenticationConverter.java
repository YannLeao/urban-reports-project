package com.project.software.urbanreports.auth;

import java.time.Clock;
import java.util.*;
import com.project.software.urbanreports.identity.UserAccountRepository;
import org.springframework.dao.DataAccessException;
import org.springframework.security.authentication.*;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.stereotype.Component;

@Component
public class SessionAuthenticationConverter {
    private final AuthSessionRepository sessions;
    private final UserAccountRepository accounts;
    private final Clock clock;
    public SessionAuthenticationConverter(AuthSessionRepository sessions, UserAccountRepository accounts, Clock clock) {
        this.sessions = sessions; this.accounts = accounts; this.clock = clock;
    }
    public AbstractAuthenticationToken convert(Jwt jwt) {
        try {
            UUID userId = UUID.fromString(jwt.getSubject());
            var session = sessions.findById(UUID.fromString(jwt.getId())).orElseThrow(() -> invalid());
            if (!session.getUserId().equals(userId) || !session.active(clock.instant())
                    || !session.getCreatedAt().equals(jwt.getIssuedAt()) || !session.getExpiresAt().equals(jwt.getExpiresAt()))
                throw invalid();
            var user = accounts.findById(userId).orElseThrow(() -> invalid()).response();
            var identity = new AuthenticatedIdentity(userId, session.getId(), user);
            return UsernamePasswordAuthenticationToken.authenticated(identity, null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + user.role().name())));
        } catch (DataAccessException exception) {
            throw new AuthenticationUnavailableException();
        }
    }
    private static InvalidBearerTokenException invalid() { return new InvalidBearerTokenException("Invalid access token"); }
}
