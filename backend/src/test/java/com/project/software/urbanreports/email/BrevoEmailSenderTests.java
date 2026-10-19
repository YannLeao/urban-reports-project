package com.project.software.urbanreports.email;

import com.project.software.urbanreports.administration.TransactionalActivationMailSender;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static com.project.software.urbanreports.email.EmailSendException.Category.*;

@ExtendWith(OutputCaptureExtension.class)
class BrevoEmailSenderTests {
    static final String KEY = "synthetic-key-marker";
    static final String LINK = "https://example.com/ativar-administrador#token=synthetic-secret-marker";
    final JsonMapper mapper = JsonMapper.builder().build();
    final EmailMessage message = new EmailMessage("private-recipient@example.com", "Alô Cidade", LINK);
    HttpServer server;
    URI endpoint;
    AtomicInteger calls;
    AtomicReference<String> body;
    AtomicReference<String> method;
    AtomicReference<String> auth;
    AtomicReference<String> contentType;
    void serve(int status, String response, long delay) throws Exception {
        calls = new AtomicInteger(); body = new AtomicReference<>(); method = new AtomicReference<>();
        auth = new AtomicReference<>(); contentType = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/v3/smtp/email", exchange -> {
            calls.incrementAndGet(); method.set(exchange.getRequestMethod()); auth.set(exchange.getRequestHeaders().getFirst("api-key"));
            contentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            try {
                if (delay > 0) Thread.sleep(delay);
                if (status == 0) return; // peer closes without a response: no POST replay allowed
                exchange.getResponseHeaders().set("Location", endpoint.toString());
                byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(status, bytes.length);
                if (delay < 0) {
                    exchange.getResponseBody().write(bytes, 0, 1);
                    exchange.getResponseBody().flush();
                    Thread.sleep(-delay);
                    exchange.getResponseBody().write(bytes, 1, bytes.length - 1);
                } else exchange.getResponseBody().write(bytes);
            } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            finally { exchange.close(); }
        });
        endpoint = URI.create("http://localhost:" + server.getAddress().getPort() + "/v3/smtp/email");
        server.start();
    }
    BrevoEmailSender sender(long timeout) { return new BrevoEmailSender(mapper, KEY, "sender@example.com", "Alô Cidade", 300, timeout, endpoint); }
    @AfterEach void stop() { if (server != null) server.stop(0); }
    @Test void compositionPreservesFullLinkAndPortuguese() {
        AtomicReference<EmailMessage> captured = new AtomicReference<>();
        new TransactionalActivationMailSender(mail -> { captured.set(mail); return new EmailSendResult("opaque"); }).send(message.recipient(), LINK);
        assertThat(captured.get().recipient()).isEqualTo(message.recipient());
        assertThat(captured.get().subject()).contains("Ative", "Alô Cidade");
        assertThat(captured.get().text()).contains("Você", "Alô Cidade", "24 horas", LINK);
        assertThat(captured.get().toString()).doesNotContain(LINK, message.recipient());
        assertThat(new EmailSendResult("private-id").toString()).doesNotContain("private-id");
    }
    @Test void acceptsOnlyCreatedWithIdAndSendsExpectedUtf8Contract() throws Exception {
        serve(201, "{\"messageId\":\"opaque-id\"}", 0);
        assertThat(sender(1000).send(message).messageId()).isEqualTo("opaque-id");
        assertThat(calls.get()).isEqualTo(1); assertThat(method.get()).isEqualTo("POST");
        assertThat(auth.get()).isEqualTo(KEY); assertThat(contentType.get()).contains("application/json", "UTF-8");
        var json = mapper.readTree(body.get());
        assertThat(json.path("sender").path("email").asString()).isEqualTo("sender@example.com");
        assertThat(json.path("sender").path("name").asString()).isEqualTo("Alô Cidade");
        assertThat(json.path("to").get(0).path("email").asString()).isEqualTo(message.recipient());
        assertThat(json.path("subject").asString()).isEqualTo(message.subject());
        assertThat(json.path("textContent").asString()).isEqualTo(LINK);
        assertThat(BrevoEmailSender.ENDPOINT.toString()).isEqualTo("https://api.brevo.com/v3/smtp/email");
    }
    @ParameterizedTest @ValueSource(ints = {200, 202, 301, 302, 307, 308, 400, 401, 403, 422, 429, 500, 503})
    void rejectsUnexpectedStatusWithoutRetryOrRedirect(int status, CapturedOutput output) throws Exception {
        serve(status, KEY + LINK + message.recipient(), 0);
        assertThatThrownBy(() -> sender(1000).send(message)).isInstanceOfSatisfying(EmailSendException.class, e -> {
            assertThat(e.status()).isEqualTo(status);
            assertThat(e.category()).isEqualTo(status == 429 || status >= 500 ? TRANSIENT : PERMANENT);
            assertSanitized(e, output);
        });
        assertThat(calls.get()).isEqualTo(1);
    }
    @ParameterizedTest @ValueSource(strings = {"not-json", "{}", "null", "{\"messageId\":\"\"}", "{\"messageId\":\"  \"}", "{\"messageId\":1}"})
    void malformedAcceptanceIsUncertain(String response) throws Exception {
        serve(201, response, 0);
        assertThatThrownBy(() -> sender(1000).send(message)).isInstanceOfSatisfying(EmailSendException.class,
                e -> assertThat(e.category()).isEqualTo(UNCERTAIN));
        assertThat(calls.get()).isEqualTo(1);
    }
    @Test void missingAndInvalidConfigurationNeverConnect(CapturedOutput output) throws Exception {
        serve(201, "{\"messageId\":\"id\"}", 0);
        for (String key : new String[]{"", "bad\nkey"}) {
            assertThatThrownBy(() -> new BrevoEmailSender(mapper, key, "sender@example.com", "Alô Cidade", 100, 100, endpoint).send(message))
                    .isInstanceOfSatisfying(EmailSendException.class, e -> { assertThat(e.category()).isEqualTo(CONFIGURATION); assertSanitized(e, output); });
        }
        for (String from : new String[]{"", "invalid", "bad\n@example.com"})
            assertThatThrownBy(() -> new BrevoEmailSender(mapper, KEY, from, "Alô Cidade", 100, 100, endpoint).send(message)).isInstanceOf(EmailSendException.class);
        assertThatThrownBy(() -> new BrevoEmailSender(mapper, KEY, "sender@example.com", "Alô Cidade", 0, 100, endpoint)).isInstanceOf(EmailSendException.class);
        assertThat(calls.get()).isZero();
    }
    @Test void refusedConnectionIsSanitized(CapturedOutput output) throws Exception {
        try (var socket = new ServerSocket(0)) { endpoint = URI.create("http://localhost:" + socket.getLocalPort() + "/v3/smtp/email"); }
        assertThatThrownBy(() -> sender(1000).send(message)).isInstanceOfSatisfying(EmailSendException.class,
                e -> { assertThat(e.category()).isEqualTo(TRANSIENT); assertSanitized(e, output); });
    }
    @Test void timeoutIsBoundedUncertainAndNeverRetried(CapturedOutput output) throws Exception {
        serve(201, "{\"messageId\":\"id\"}", 350);
        long start = System.nanoTime();
        assertThatThrownBy(() -> sender(150).send(message)).isInstanceOfSatisfying(EmailSendException.class,
                e -> { assertThat(e.category()).isEqualTo(UNCERTAIN); assertSanitized(e, output); });
        assertThat(java.time.Duration.ofNanos(System.nanoTime() - start).toMillis()).isLessThan(1500);
        assertThat(calls.get()).isEqualTo(1);
    }
    @Test void deadlineAlsoBoundsBodyAfterSuccessfulHeaders() throws Exception {
        serve(201, "{\"messageId\":\"id\"}", -500);
        long start = System.nanoTime();
        assertThatThrownBy(() -> sender(200).send(message)).isInstanceOfSatisfying(EmailSendException.class,
                e -> assertThat(e.category()).isEqualTo(UNCERTAIN));
        assertThat(java.time.Duration.ofNanos(System.nanoTime() - start).toMillis()).isLessThan(1500);
        assertThat(calls.get()).isEqualTo(1);
    }
    @Test void droppedResponseDoesNotReplayPost(CapturedOutput output) throws Exception {
        serve(0, "", 0);
        assertThatThrownBy(() -> sender(1000).send(message)).isInstanceOfSatisfying(EmailSendException.class,
                e -> { assertThat(e.category()).isEqualTo(UNCERTAIN); assertSanitized(e, output); });
        assertThat(calls.get()).isEqualTo(1);
    }
    void assertSanitized(EmailSendException e, CapturedOutput output) {
        assertThat(e.getCause()).isNull();
        assertThat(e.toString() + output.getAll()).doesNotContain(KEY, LINK, message.recipient());
    }
}
