package com.project.software.urbanreports.identity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_accounts")
public class UserAccount {
    @Id private UUID id;
    @Column(nullable = false, length = 100) private String name;
    @Column(nullable = false, length = 254) private String email;
    @Column(name = "password_hash", nullable = false, length = 512) private String passwordHash;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32) private AccountRole role;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected UserAccount() {}

    UserAccount(String name, String email, String passwordHash) {
        this.id = UUID.randomUUID();
        this.name = name;
        this.email = email;
        this.passwordHash = passwordHash;
        this.role = AccountRole.USER;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    public UUID getId() { return id; }
    public String getPasswordHash() { return passwordHash; }
    public void changePasswordHash(String hash, Instant instant) {
        this.passwordHash = java.util.Objects.requireNonNull(hash);
        this.updatedAt = instant;
    }
    public RegistrationResponse response() { return new RegistrationResponse(id, name, email, role); }
}
