package com.project.software.urbanreports.email;

import com.project.software.urbanreports.recovery.*;
import com.project.software.urbanreports.identity.*;
import com.project.software.urbanreports.auth.SessionRevocation;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.system.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint=",
        "recovery.frontend-origin=https://recovery.example.com/", "email.request-timeout-ms=200"})
@Import({TestcontainersConfiguration.class, RecoveryEmailIntegrationTests.Transport.class})
@ExtendWith(OutputCaptureExtension.class)
class RecoveryEmailIntegrationTests {
    static final String PASSWORD = "sentinel-password-valid-long-phrase";
    @Autowired PasswordRecoveryService service;
    @Autowired RegistrationService registration;
    @Autowired JdbcTemplate jdbc;
    @Autowired Probe probe;
    @Autowired ObjectMapper mapper;
    @Autowired UserAccountRepository accounts;
    @Autowired PasswordRecoveryTokens tokens;
    @Autowired SessionRevocation revocation;
    @Autowired PasswordEncoder encoder;
    @Autowired PlatformTransactionManager manager;
    @Autowired RecoveryDelivery delivery;
    @Autowired RecoveryDiagnostics diagnostics;
    @MockitoBean Clock clock;
    @MockitoSpyBean TransactionalPasswordRecoveryMailSender mail;
    CountDownLatch finished;
    volatile boolean outsideTransaction;

    @BeforeEach void prepare() {
        when(clock.instant()).thenReturn(Instant.parse("2026-11-01T00:00:00Z"));
        probe.status = 201; probe.delay = 0; probe.body = "{\"messageId\":\"sentinel-message-id\"}";
        probe.requests.clear(); finished = new CountDownLatch(1); outsideTransaction = false;
        doAnswer(call -> {
            outsideTransaction = !TransactionSynchronizationManager.isActualTransactionActive();
            try { return call.callRealMethod(); } finally { finished.countDown(); }
        }).when(mail).send(anyString(), anyString(), any());
    }

    @Test void committedRequestReachesRealAdapterAndControlledHttpTransport(CapturedOutput logs) throws Exception {
        var user = user(); service.request(user.email(), "acceptance");
        assertThat(finished.await(5, TimeUnit.SECONDS)).isTrue(); assertThat(outsideTransaction).isTrue();
        var payload = probe.requests.poll(5, TimeUnit.SECONDS); assertThat(payload).isNotNull();
        var text = mapper.readTree(payload).path("textContent").asString();
        String raw = text.substring(text.indexOf("#token=") + 7).split("\\s", 2)[0];
        assertThat(raw.length()).isEqualTo(43);
        assertThat(tokens.locate(raw)).contains(user.id());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM password_recovery_tokens WHERE account_id=? AND consumed_at IS NULL", Integer.class, user.id())).isEqualTo(1);
        assertThat(probe.requests).isEmpty();
        assertSafe(logs, user.email(), raw, payload);
    }

    @Test void rejectionIsObservedOnceByTransportWithoutSensitiveData(CapturedOutput logs) throws Exception {
        probe.status = 400; probe.body = "{\"code\":\"invalid_parameter\",\"detail\":\"sentinel-provider-secret\"}";
        var user = user(); service.request(user.email(), "rejected");
        assertThat(finished.await(5, TimeUnit.SECONDS)).isTrue(); assertThat(outsideTransaction).isTrue();
        String payload = probe.requests.poll(5, TimeUnit.SECONDS); assertThat(payload).isNotNull();
        assertThat(logs.getOut()).contains("PASSWORD_RECOVERY", "provider_http_rejected", "PERMANENT");
        assertThat(logs.getOut().lines().filter(line -> line.contains("PASSWORD_RECOVERY") && line.contains("email.send.completed")).count()).isEqualTo(1);
        assertSafe(logs, user.email(), payload);
    }

    @Test void timeoutIsUncertainAndNeverRetried(CapturedOutput logs) throws Exception {
        probe.delay = 600;
        var user = user(); service.request(user.email(), "timeout");
        assertThat(finished.await(5, TimeUnit.SECONDS)).isTrue(); assertThat(outsideTransaction).isTrue();
        assertThat(probe.requests.size()).isEqualTo(1);
        assertThat(logs.getOut()).contains("PASSWORD_RECOVERY", "UNCERTAIN");
        assertSafe(logs, user.email(), probe.requests.peek());
    }

    @Test void invalidOriginAndTransportConfigurationDoNotReplaceExistingTokens(CapturedOutput logs) throws Exception {
        var user = user(); service.request(user.email(), "setup");
        assertThat(finished.await(5, TimeUnit.SECONDS)).isTrue();
        int before = jdbc.queryForObject("SELECT count(*) FROM password_recovery_tokens WHERE account_id=? AND consumed_at IS NULL", Integer.class, user.id());
        var invalidSettings = new RecoverySettings("https://sentinel-link-secret.example.com/path", "2", "8", "30", "200", "30", "30", "10000");
        var invalid = new PasswordRecoveryService(accounts, tokens, mail, revocation, encoder, clock, manager,
                invalidSettings, delivery, new RecoveryLimits(clock, invalidSettings), diagnostics);
        for (int i = 0; i < 3; i++) invalid.request(user.email(), "invalid-origin");
        var missingKey = new TransactionalPasswordRecoveryMailSender(new BrevoEmailSender(mapper, "", "", "Alô Cidade", 100, 200, probe.endpoint()));
        var validSettings = new RecoverySettings("https://example.com", "2", "8", "30", "200", "30", "30", "10000");
        var unavailable = new PasswordRecoveryService(accounts, tokens, missingKey, revocation, encoder, clock, manager,
                validSettings, delivery, new RecoveryLimits(clock, validSettings), diagnostics);
        unavailable.request(user.email(), "invalid-key");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM password_recovery_tokens WHERE account_id=? AND consumed_at IS NULL", Integer.class, user.id())).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM password_recovery_tokens WHERE account_id=?", Integer.class, user.id())).isEqualTo(1);
        assertThat(probe.requests.size()).isEqualTo(1);
        assertThat(logs.getOut()).contains("recovery_configuration_invalid");
        assertSafe(logs, user.email(), "sentinel-link-secret");
    }

    RegistrationResponse user() { return registration.register(new RegistrationRequest("Pessoa teste", UUID.randomUUID() + "@example.com", PASSWORD)); }
    void assertSafe(CapturedOutput logs, String... secrets) {
        String output = logs.getAll();
        assertThat(output).doesNotContain(PASSWORD, "sentinel-api-key", "sentinel-provider-secret", "#token=", "sentinel-message-id");
        for (String secret : secrets) assertThat(output.contains(secret)).isFalse();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Transport {
        @Bean(destroyMethod = "close") Probe probe() throws Exception { return new Probe(); }
        @Bean @Primary TransactionalEmailSender controlledEmail(ObjectMapper mapper, Probe probe) {
            return new BrevoEmailSender(mapper, "sentinel-api-key", "sender@example.com", "Alô Cidade", 100, 200, probe.endpoint());
        }
    }
    static class Probe implements AutoCloseable {
        final HttpServer server;
        final ExecutorService executor = Executors.newFixedThreadPool(2);
        final BlockingQueue<String> requests = new LinkedBlockingQueue<>();
        volatile int status = 201;
        volatile long delay;
        volatile String body = "{\"messageId\":\"sentinel-message-id\"}";
        Probe() throws Exception {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setExecutor(executor);
            server.createContext("/", exchange -> {
                try (exchange) {
                    requests.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                    try { Thread.sleep(delay); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(status, bytes.length); exchange.getResponseBody().write(bytes);
                } catch (java.io.IOException ignored) { /* Client deadline may close the socket. */ }
            }); server.start();
        }
        URI endpoint() { return URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/"); }
        @Override public void close() { server.stop(0); executor.shutdownNow(); }
    }
}
