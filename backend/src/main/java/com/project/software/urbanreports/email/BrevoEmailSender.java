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
        this.mapper = mapper; this.key = key; this.from = from; this.name = name; this.endpoint = endpoint;
        if (connectTimeout <= 0 || connectTimeout > 30000 || requestTimeout <= 0 || requestTimeout > 60000)
            throw new EmailSendException(CONFIGURATION, 0);
        this.requestTimeout = Duration.ofMillis(requestTimeout);
        client = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(connectTimeout))
                .followRedirects(HttpClient.Redirect.NEVER).version(HttpClient.Version.HTTP_1_1).build();
    }

    @Override public EmailSendResult send(EmailMessage message) {
        if (key == null || key.isBlank() || key.chars().anyMatch(c -> c < 33 || c > 126)
                || from == null || !from.matches("[^\\s@<>]+@[^\\s@<>]+\\.[^\\s@<>]+")
                || name == null || name.isBlank() || name.contains("\r") || name.contains("\n"))
            throw new EmailSendException(CONFIGURATION, 0);
        CompletableFuture<HttpResponse<String>> pending = null;
        try {
            String json = mapper.writeValueAsString(Map.of("sender", Map.of("email", from, "name", name),
                    "to", List.of(Map.of("email", message.recipient())), "subject", message.subject(), "textContent", message.text()));
            var request = HttpRequest.newBuilder(endpoint).timeout(requestTimeout)
                    .header("api-key", key).header("Accept", "application/json")
                    .header("Content-Type", "application/json; charset=UTF-8")
                    .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8)).build();
            // Single POST, no retry loop. Deadline also covers response body completion.
            pending = client.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            var response = pending.get(requestTimeout.toMillis(), TimeUnit.MILLISECONDS);
            int status = response.statusCode();
            if (status != 201) throw new EmailSendException(status == 429 || status >= 500 ? TRANSIENT : PERMANENT, status);
            try {
                var id = mapper.readTree(response.body()).path("messageId");
                if (!id.isString() || id.asString().isBlank()) throw new EmailSendException(UNCERTAIN, status);
                return new EmailSendResult(id.asString());
            } catch (EmailSendException e) { throw e; }
            catch (RuntimeException e) { throw new EmailSendException(UNCERTAIN, status); }
        } catch (EmailSendException e) { throw e; }
        catch (InterruptedException e) {
            Thread.currentThread().interrupt(); throw new EmailSendException(UNCERTAIN, 0);
        } catch (ExecutionException e) {
            var cause = e.getCause();
            throw new EmailSendException(cause instanceof java.net.ConnectException
                    || cause instanceof java.net.http.HttpConnectTimeoutException
                    || cause instanceof javax.net.ssl.SSLHandshakeException ? TRANSIENT : UNCERTAIN, 0);
        } catch (TimeoutException e) { throw new EmailSendException(UNCERTAIN, 0); }
        catch (RuntimeException e) { throw new EmailSendException(CONFIGURATION, 0); }
        finally { if (pending != null && !pending.isDone()) pending.cancel(true); }
    }

    @Override public String toString() { return "BrevoEmailSender[redacted]"; }
}
