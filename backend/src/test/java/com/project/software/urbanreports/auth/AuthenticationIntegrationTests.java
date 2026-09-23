package com.project.software.urbanreports.auth;

import com.project.software.urbanreports.identity.*;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.bean.override.mockito.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.*;
import com.nimbusds.jwt.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint="})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AuthenticationIntegrationTests {
    static final String PASSWORD = "  synthetic password for tests  ";
    static final Instant NOW = Instant.parse("2026-09-23T12:00:00Z");
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserAccountRepository accounts;
    @Autowired RegistrationService registration;
    @Autowired SessionRevocation revocation;
    @Autowired LoginService login;
    @Autowired JwtConfiguration.Keys keys;
    @Autowired JwtDecoder decoder;
    @Autowired PlatformTransactionManager manager;
    @MockitoBean Clock clock;
    @MockitoSpyBean PasswordEncoder encoder;
    @MockitoSpyBean AuthSessionRepository sessions;

    @BeforeEach void time() { when(clock.instant()).thenReturn(NOW); }
    RegistrationResponse account() {
        return registration.register(new RegistrationRequest("Pessoa sintética", UUID.randomUUID() + "@example.com", PASSWORD));
    }
    String token(RegistrationResponse user) throws Exception {
        var response = mvc.perform(post("/api/auth/login").contentType("application/json")
                .content(mapper.writeValueAsString(Map.of("email", " " + user.email().toUpperCase(Locale.ROOT) + " ", "password", PASSWORD))))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().doesNotExist("Set-Cookie")).andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.user.id").value(user.id().toString())).andReturn();
        assertThat(response.getRequest().getSession(false)).isNull();
        return mapper.readTree(response.getResponse().getContentAsString()).get("accessToken").asString();
    }
    void me(String token, int status) throws Exception {
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().is(status)).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().doesNotExist("Set-Cookie"));
    }
    @Test void loginMeLogoutIndependentSessionsAndDenyAll() throws Exception {
        var user = account(); String first = token(user), second = token(user);
        me(first, 200); me(second, 200);
        var jwt = decoder.decode(first);
        assertThat(jwt.getClaims().keySet()).containsExactlyInAnyOrder("iss", "aud", "sub", "jti", "iat", "exp");
        assertThat(jwt.getExpiresAt()).isEqualTo(NOW.plusSeconds(1800));
        mvc.perform(get("/api/storage/images").header("Authorization", "Bearer " + first)).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/logout").contentType("application/json").header("Authorization", "Bearer " + first))
                .andExpect(status().isNoContent()).andExpect(header().string("Cache-Control", "no-store"));
        me(first, 401); me(second, 200);
        mvc.perform(post("/api/auth/logout").contentType("application/json").header("Authorization", "Bearer " + first))
                .andExpect(status().isUnauthorized()).andExpect(header().string("WWW-Authenticate", "Bearer"));
    }
    @Test void genericFailureDoesNotCreateSessionsAndChecksDummyHash() throws Exception {
        var user = account();
        long before = sessions.count();
        clearInvocations(encoder);
        for (String email : List.of(user.email(), "missing@example.com")) {
            mvc.perform(post("/api/auth/login").contentType("application/json")
                    .content(mapper.writeValueAsString(Map.of("email", email, "password", "wrong"))))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        }
        verify(encoder, times(2)).matches(eq("wrong"), anyString());
        assertThat(sessions.count()).isEqualTo(before);
        for (String body : List.of("{}", "null", "[]", "{} {}", "{\"email\":123}",
                mapper.writeValueAsString(Map.of("email", user.email(), "password", "x".repeat(9000))),
                mapper.writeValueAsString(Map.of("email", user.email(), "password", PASSWORD, "role", "ADMIN")))) {
            mvc.perform(post("/api/auth/login").contentType("application/json").content(body)).andExpect(status().isBadRequest());
        }
        for (String type : List.of("text/plain", "application/x-www-form-urlencoded", "multipart/form-data")) {
            mvc.perform(post("/api/auth/login").contentType(type).content("{}")).andExpect(status().isUnsupportedMediaType());
        }
    }
    JWTClaimsSet claimSet(Map<String, Object> claims) {
        var builder = new JWTClaimsSet.Builder(); claims.forEach(builder::claim); return builder.build();
    }
    String signed(Map<String, Object> claims, String kid, java.security.interfaces.RSAPrivateKey key) throws Exception {
        var token = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(kid).build(), claimSet(claims));
        token.sign(new RSASSASigner(key)); return token.serialize();
    }
    Map<String, Object> claims(String token) throws Exception {
        return new HashMap<>(SignedJWT.parse(token).getJWTClaimsSet().getClaims());
    }
    @Test void rejectsCryptographicClaimAndSessionFailures() throws Exception {
        var user = account(); String valid = token(user);
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").param("access_token", valid)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").cookie(new jakarta.servlet.http.Cookie("access_token", valid))).andExpect(status().isUnauthorized());
        me("malformed", 401);
        me(signed(claims(valid), "unknown", keys.privateKey()), 401);
        var generator = java.security.KeyPairGenerator.getInstance("RSA"); generator.initialize(2048);
        me(signed(claims(valid), "test-key", (java.security.interfaces.RSAPrivateKey) generator.generateKeyPair().getPrivate()), 401);
        me(new PlainJWT(claimSet(claims(valid))).serialize(), 401);
        var hmac = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claimSet(claims(valid)));
        hmac.sign(new MACSigner(keys.publicKey().getEncoded())); me(hmac.serialize(), 401);
        for (String field : List.of("iss", "aud", "sub", "jti", "iat", "exp")) {
            var claims = claims(valid); claims.remove(field);
            me(signed(claims, "test-key", keys.privateKey()), 401);
        }
        for (var entry : Map.<String, Object>of("iss", "https://wrong.example.com", "aud", List.of("wrong"),
                "sub", UUID.randomUUID().toString(), "jti", UUID.randomUUID().toString(),
                "iat", Date.from(NOW.plusSeconds(1)), "exp", Date.from(NOW.plusSeconds(1801))).entrySet()) {
            var claims = claims(valid); claims.put(entry.getKey(), entry.getValue());
            me(signed(claims, "test-key", keys.privateKey()), 401);
        }
        var invalidUuid = claims(valid); invalidUuid.put("sub", "1-1-1-1-1");
        me(signed(invalidUuid, "test-key", keys.privateKey()), 401);
        when(clock.instant()).thenReturn(NOW.plusSeconds(1800)); me(valid, 401);
        when(clock.instant()).thenReturn(NOW); me(valid, 200);
        jdbc.update("update auth_sessions set expires_at = ? where user_id = ?", java.sql.Timestamp.from(NOW.plusSeconds(10)), user.id());
        me(valid, 401);
        String other = token(user); accounts.deleteById(user.id()); me(other, 401);
    }
    @Test void databaseFailureIsUnavailableNeverAuthenticated() throws Exception {
        String valid = token(account());
        doThrow(new org.springframework.dao.DataAccessResourceFailureException("synthetic outage"))
                .when(sessions).findById(any());
        me(valid, 503);
    }
    @Test void rejectsMalformedClaimTypesAfterSignatureVerification() throws Exception {
        String valid = token(account());
        var base = new HashMap<String, Object>(SignedJWT.parse(valid).getJWTClaimsSet().toJSONObject());
        for (var entry : Map.<String, Object>of("iss", 42, "aud", 42, "sub", 42,
                "jti", List.of("invalid"), "iat", "invalid", "exp", "invalid").entrySet()) {
            var claims = new HashMap<>(base); claims.put(entry.getKey(), entry.getValue());
            var raw = new JWSObject(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("test-key").build(),
                    new Payload(mapper.writeValueAsString(claims)));
            raw.sign(new RSASSASigner(keys.privateKey())); me(raw.serialize(), 401);
        }
    }
    @Test void failedSessionPersistenceRollsBackAndReturnsNoCredential() throws Exception {
        var user = account(); long before = sessions.count();
        // Deferred database failure happens at commit, after saveAndFlush and signing.
        jdbc.execute("CREATE FUNCTION fail_session_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
                + "RAISE EXCEPTION 'synthetic commit failure' USING ERRCODE = '08000'; END $$");
        jdbc.execute("CREATE CONSTRAINT TRIGGER fail_session_commit AFTER INSERT ON auth_sessions "
                + "DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_session_commit()");
        try {
            mvc.perform(post("/api/auth/login").contentType("application/json")
                    .content(mapper.writeValueAsString(Map.of("email", user.email(), "password", PASSWORD))))
                    .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.accessToken").doesNotExist());
        } finally {
            jdbc.execute("DROP TRIGGER fail_session_commit ON auth_sessions");
            jdbc.execute("DROP FUNCTION fail_session_commit()");
        }
        assertThat(sessions.count()).isEqualTo(before);
    }
    void resetPassword(UUID userId, String hash, boolean rollback) {
        new TransactionTemplate(manager).executeWithoutResult(status -> {
            var account = accounts.lockById(userId).orElseThrow();
            account.changePasswordHash(hash, NOW);
            revocation.revokeAllSessions(userId, NOW);
            if (rollback) throw new IllegalStateException("synthetic rollback");
        });
    }
    @Test void passwordChangeAndGlobalRevocationCommitAndRollbackTogether() throws Exception {
        var user = account(); String a = token(user), b = token(user);
        String original = accounts.findById(user.id()).orElseThrow().getPasswordHash();
        String next = encoder.encode("new synthetic password");
        assertThatThrownBy(() -> resetPassword(user.id(), next, true)).isInstanceOf(IllegalStateException.class);
        assertThat(accounts.findById(user.id()).orElseThrow().getPasswordHash()).isEqualTo(original);
        me(a, 200); me(b, 200);
        resetPassword(user.id(), next, false);
        me(a, 401); me(b, 401);
        assertThatThrownBy(() -> login.login(user.email(), PASSWORD)).isInstanceOf(org.springframework.security.authentication.BadCredentialsException.class);
        assertThat(login.login(user.email(), "new synthetic password").user().id()).isEqualTo(user.id());
    }
    @Test void passwordResetBetweenHashCheckAndAccountLockPreventsOldCredential() throws Exception {
        var user = account();
        var checked = new CountDownLatch(1); var resume = new CountDownLatch(1);
        var thread = new AtomicReference<Thread>();
        doAnswer(invocation -> {
            boolean matched = (boolean) invocation.callRealMethod();
            if (Thread.currentThread() == thread.get()) {
                checked.countDown(); assertThat(resume.await(10, TimeUnit.SECONDS)).isTrue();
            }
            return matched;
        }).when(encoder).matches(eq(PASSWORD), anyString());
        try (var executor = Executors.newSingleThreadExecutor()) {
            var attempt = executor.submit(() -> { thread.set(Thread.currentThread()); return login.login(user.email(), PASSWORD); });
            try {
                assertThat(checked.await(10, TimeUnit.SECONDS)).isTrue();
                resetPassword(user.id(), encoder.encode("new synthetic password"), false);
            } finally { resume.countDown(); }
            assertThatThrownBy(() -> attempt.get(10, TimeUnit.SECONDS)).hasCauseInstanceOf(org.springframework.security.authentication.BadCredentialsException.class);
        }
        assertThat(jdbc.queryForObject("select count(*) from auth_sessions where user_id = ?", Long.class, user.id())).isZero();
    }
}
