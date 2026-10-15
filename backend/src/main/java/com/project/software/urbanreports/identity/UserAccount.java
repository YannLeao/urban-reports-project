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
    @Column(name = "password_hash", length = 512) private String passwordHash;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32) private AccountStatus status = AccountStatus.ACTIVE;
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
    public AccountRole getRole() { return role; }
    public AccountStatus getStatus() { return status; }
    public boolean isActive() { return status == AccountStatus.ACTIVE; }
    public String getName() { return name; }
    public String getEmail() { return email; }
    public Instant getCreatedAt() { return createdAt; }

    public static UserAccount pendingAdmin(String name, String email, Instant now) {
        var account = new UserAccount(name, email, null);
        account.role = AccountRole.ADMIN;
        account.status = AccountStatus.PENDING_ACTIVATION;
        account.createdAt = now; account.updatedAt = now;
        return account;
    }

    public static UserAccount firstSuperAdmin(String name, String email, String hash, Instant now) {
        var account = new UserAccount(name, email, hash);
        account.role = AccountRole.SUPER_ADMIN;
        account.createdAt = now; account.updatedAt = now;
        return account;
    }

    public void activateAdmin(String hash, Instant now) {
        if (role != AccountRole.ADMIN || status != AccountStatus.PENDING_ACTIVATION) throw new IllegalStateException();
        changePasswordHash(hash, now);
        status = AccountStatus.ACTIVE;
    }

    public void disableAdmin(Instant now) {
        if (role != AccountRole.ADMIN) throw new IllegalStateException();
        status = AccountStatus.DISABLED; updatedAt = now;
    }
    public String getPasswordHash() { return passwordHash; }
    public void changePasswordHash(String hash, Instant instant) {
        this.passwordHash = java.util.Objects.requireNonNull(hash);
        this.updatedAt = instant;
    }
    public RegistrationResponse response() { return new RegistrationResponse(id, name, email, role); }
}
