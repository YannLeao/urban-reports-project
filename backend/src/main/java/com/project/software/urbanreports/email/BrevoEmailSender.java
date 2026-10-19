package com.project.software.urbanreports.email;

import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import static com.project.software.urbanreports.email.EmailSendException.Category.*;
import static com.project.software.urbanreports.email.EmailObservation.Reason.*;
import static com.project.software.urbanreports.email.EmailObservation.Stage.*;

@Component
public final class BrevoEmailSender implements TransactionalEmailSender {
    static final URI ENDPOINT = URI.create("https://api.brevo.com/v3/smtp/email");
    private final ObjectMapper mapper;
    private final String key, from, name;
    private final Duration requestTimeout;
    private final HttpClient client;
    private final URI endpoint;

    @Autowired
    public BrevoEmailSender(ObjectMapper mapper, @Value("${email.brevo.api-key:}") String key,
            @Value("${email.from:}") String from, @Value("${email.from-name:Alô Cidade}") String name,
            @Value("${email.connect-timeout-ms:3000}") long connectTimeout,
            @Value("${email.request-timeout-ms:10000}") long requestTimeout) {
        this(mapper, key, from, name, connectTimeout, requestTimeout, ENDPOINT);
    }

    // Package-private seam: only local controlled tests can replace the fixed production endpoint.
    BrevoEmailSender(ObjectMapper mapper, String key, String from, String name,
            long connectTimeout, long requestTimeout, URI endpoint) {
        this(mapper, key, from, name, connectTimeout, requestTimeout, endpoint,
                createClient(connectTimeout, requestTimeout));
    }

    BrevoEmailSender(ObjectMapper mapper, String key, String from, String name,
            long connectTimeout, long requestTimeout, URI endpoint, HttpClient client) {
        this.mapper = mapper; this.key = key; this.from = from; this.name = name; this.endpoint = endpoint;
        validateTimeouts(connectTimeout, requestTimeout);
        this.requestTimeout = Duration.ofMillis(requestTimeout);
        this.client = client;
    }

    private static void validateTimeouts(long connectTimeout, long requestTimeout) {
        if (connectTimeout <= 0 || connectTimeout > 30000 || requestTimeout <= 0 || requestTimeout > 60000)
            throw new EmailSendException(CONFIGURATION, 0);
    }

    private static HttpClient createClient(long connectTimeout, long requestTimeout) {
        validateTimeouts(connectTimeout, requestTimeout);
        return HttpClient.newBuilder().connectTimeout(Duration.ofMillis(connectTimeout))
                .followRedirects(HttpClient.Redirect.NEVER).version(HttpClient.Version.HTTP_1_1).build();
    }

    @Override public EmailSendResult send(EmailMessage message) {
        return send(message, new EmailObservation(EmailObservation.Operation.GENERIC));
    }

    private EmailObservation.Reason configurationProblem() {
        if (key == null || key.isBlank() || from == null || from.isBlank() || name == null || name.isBlank())
            return configuration_missing;
        if (key.chars().anyMatch(c -> c < 33 || c > 126)
                || !from.matches("[^\\s@<>]+@[^\\s@<>]+\\.[^\\s@<>]+")
                || name.contains("\r") || name.contains("\n")) return configuration_invalid;
        return null;
    }

    @Override public void validateConfiguration() {
        if (configurationProblem() != null) throw new EmailSendException(CONFIGURATION, 0);
    }

    @Override public EmailSendResult send(EmailMessage message, EmailObservation observation) {
        observation.stage(VALIDATION);
        CompletableFuture<HttpResponse<String>> pending = null;
        EmailObservation.Reason reason = configuration_invalid;
        int status = 0;
        EmailObservation.ProviderCode code = null;
        try {
            var problem = configurationProblem();
            if (problem != null) {
                reason = problem;
                throw new EmailSendException(CONFIGURATION, 0);
            }
            observation.stage(SERIALIZATION);
            reason = serialization_failed;
            String json = mapper.writeValueAsString(Map.of("sender", Map.of("email", from, "name", name),
                    "to", List.of(Map.of("email", message.recipient())), "subject", message.subject(), "textContent", message.text()));
            var request = HttpRequest.newBuilder(endpoint).timeout(requestTimeout)
                    .header("api-key", key).header("Accept", "application/json")
                    .header("Content-Type", "application/json; charset=UTF-8")
                    .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8)).build();
            // Single POST, no retry loop. Deadline also covers response body completion.
            observation.dispatch();
            reason = unknown_failure;
            pending = client.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            var response = pending.get(requestTimeout.toMillis(), TimeUnit.MILLISECONDS);
            status = response.statusCode();
            observation.stage(RESPONSE_VALIDATION);
            if (status != 201) {
                reason = provider_http_rejected;
                code = providerCode(response.body());
                throw new EmailSendException(status == 429 || status >= 500 ? TRANSIENT : PERMANENT, status);
            }
            reason = response_invalid_json;
            try {
                var id = mapper.readTree(response.body()).path("messageId");
                reason = response_missing_message_id;
                if (!id.isString() || id.asString().isBlank()) throw new EmailSendException(UNCERTAIN, status);
                var result = new EmailSendResult(id.asString());
                observation.accepted();
                return result;
            } catch (EmailSendException e) { throw e; }
            catch (RuntimeException e) { throw new EmailSendException(UNCERTAIN, status); }
        } catch (EmailSendException e) {
            observation.failed(e.category(), reason, e.status(), code);
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            observation.failed(UNCERTAIN, interrupted, 0, null);
            throw new EmailSendException(UNCERTAIN, 0);
        } catch (ExecutionException e) {
            // Preserve the pre-existing category rule; diagnostic cause traversal does not reclassify it.
            var cause = e.getCause();
            var category = cause instanceof java.net.ConnectException
                    || cause instanceof java.net.http.HttpConnectTimeoutException
                    || cause instanceof javax.net.ssl.SSLHandshakeException ? TRANSIENT : UNCERTAIN;
            observation.failed(category, EmailObservation.reason(e), 0, null);
            throw new EmailSendException(category, 0);
        } catch (TimeoutException e) {
            observation.failed(UNCERTAIN, request_deadline_exceeded, 0, null);
            throw new EmailSendException(UNCERTAIN, 0);
        } catch (RuntimeException e) {
            observation.failed(CONFIGURATION, e instanceof CancellationException ? cancelled : reason, status, code);
            throw new EmailSendException(CONFIGURATION, 0);
        } finally { if (pending != null && !pending.isDone()) pending.cancel(true); }
    }

    private EmailObservation.ProviderCode providerCode(String body) {
        // Existing response read/deadline unchanged. Auxiliary parsing is strictly bounded.
        if (body == null || body.length() > 4096) return EmailObservation.ProviderCode.unknown_provider_code;
        try {
            return switch (mapper.readTree(body).path("code").asString()) {
                case "invalid_parameter" -> EmailObservation.ProviderCode.invalid_parameter;
                case "missing_parameter" -> EmailObservation.ProviderCode.missing_parameter;
                default -> EmailObservation.ProviderCode.unknown_provider_code;
            };
        } catch (RuntimeException ignored) { return EmailObservation.ProviderCode.unknown_provider_code; }
    }

    @Override public String toString() { return "BrevoEmailSender[redacted]"; }
}
