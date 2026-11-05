package com.project.software.urbanreports.recovery;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

@Component
public class PasswordRecoveryTokens {
    private static final long VALIDITY_SECONDS = 1800;
    private final JdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    public PasswordRecoveryTokens(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** Invalida os tokens ativos da conta e cria um novo; devolve o valor puro, que nunca é persistido. */
    @Transactional(propagation = Propagation.MANDATORY)
    public String replace(UUID accountId, Instant now) {
        invalidate(accountId, now);
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        jdbc.update("INSERT INTO password_recovery_tokens(token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                hash(raw), accountId, Timestamp.from(now), Timestamp.from(now.plusSeconds(VALIDITY_SECONDS)));
        return raw;
    }

    /** Leitura inicial só para descobrir a conta; o token é revalidado depois do lock. */
    public Optional<UUID> locate(String raw) {
        if (raw == null || !raw.matches("[A-Za-z0-9_-]{43}")) return Optional.empty();
        return jdbc.query("SELECT account_id FROM password_recovery_tokens WHERE token_hash = ?",
                (rs, row) -> rs.getObject(1, UUID.class), hash(raw)).stream().findFirst();
    }

    public boolean isCurrent(UUID accountId, String raw, Instant now) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM password_recovery_tokens t JOIN user_accounts a ON a.id = t.account_id WHERE t.token_hash = ? AND t.account_id = ? AND t.consumed_at IS NULL AND t.expires_at > ? AND a.status = 'ACTIVE')",
                Boolean.class, hash(raw), accountId, Timestamp.from(now)));
    }

    /** Consome o token se ainda for válido; o chamador já deve estar com o lock da conta. */
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean consume(UUID accountId, String raw, Instant now) {
        return jdbc.update("UPDATE password_recovery_tokens SET consumed_at = ? WHERE token_hash = ? AND account_id = ? AND consumed_at IS NULL AND expires_at > ?",
                Timestamp.from(now), hash(raw), accountId, Timestamp.from(now)) == 1;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void invalidate(UUID accountId, Instant now) {
        jdbc.update("UPDATE password_recovery_tokens SET consumed_at = ? WHERE account_id = ? AND consumed_at IS NULL",
                Timestamp.from(now), accountId);
    }

    private static String hash(String raw) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.US_ASCII))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
}
