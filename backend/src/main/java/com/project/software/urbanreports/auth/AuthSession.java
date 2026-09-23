package com.project.software.urbanreports.auth;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "auth_sessions")
public class AuthSession {
    @Id private UUID id;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "revoked_at") private Instant revokedAt;
    protected AuthSession() {}
    AuthSession(UUID userId, Instant now) {
        this.id = UUID.randomUUID(); this.userId = userId;
        this.createdAt = now; this.expiresAt = now.plusSeconds(1800);
    }
    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public boolean active(Instant now) { return revokedAt == null && now.isBefore(expiresAt); }
}
