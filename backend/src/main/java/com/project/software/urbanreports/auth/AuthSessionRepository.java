package com.project.software.urbanreports.auth;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.*;

public interface AuthSessionRepository extends JpaRepository<AuthSession, UUID> {
    @Modifying
    @Query("update AuthSession s set s.revokedAt = :instant where s.userId = :userId and s.revokedAt is null")
    int revokeAll(UUID userId, Instant instant);
    @Modifying
    @Query("update AuthSession s set s.revokedAt = :instant where s.id = :id and s.userId = :userId and s.revokedAt is null")
    int revoke(UUID id, UUID userId, Instant instant);
}
