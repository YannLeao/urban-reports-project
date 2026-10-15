package com.project.software.urbanreports.administration;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

@Component
public class AdminActivationTokens {
    private final JdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();
    public AdminActivationTokens(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    @Transactional(propagation = Propagation.MANDATORY)
    public String replace(UUID accountId, Instant now) {
        invalidate(accountId, now);
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        jdbc.update("INSERT INTO admin_activation_tokens(token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                hash(raw), accountId, java.sql.Timestamp.from(now), java.sql.Timestamp.from(now.plusSeconds(86400)));
        return raw;
    }
    public Optional<UUID> locate(String raw) {
        if (raw == null || !raw.matches("[A-Za-z0-9_-]{43}")) return Optional.empty();
        return jdbc.query("SELECT account_id FROM admin_activation_tokens WHERE token_hash = ?", (rs, row) -> rs.getObject(1, UUID.class), hash(raw)).stream().findFirst();
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean valid(UUID accountId, String raw, Instant now) {
        return jdbc.queryForObject("SELECT count(*) FROM admin_activation_tokens WHERE token_hash = ? AND account_id = ? AND consumed_at IS NULL AND expires_at > ?",
                Integer.class, hash(raw), accountId, java.sql.Timestamp.from(now)) == 1;
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean consume(UUID accountId, String raw, Instant now) {
        // The caller holds the account lock before updating tokens, as in password recovery.
        return jdbc.update("UPDATE admin_activation_tokens SET consumed_at = ? WHERE token_hash = ? AND account_id = ? AND consumed_at IS NULL AND expires_at > ?",
                java.sql.Timestamp.from(now), hash(raw), accountId, java.sql.Timestamp.from(now)) == 1;
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public void invalidate(UUID accountId, Instant now) {
        jdbc.update("UPDATE admin_activation_tokens SET consumed_at = ? WHERE account_id = ? AND consumed_at IS NULL", java.sql.Timestamp.from(now), accountId);
    }
    static String hash(String raw) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.US_ASCII))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
}
