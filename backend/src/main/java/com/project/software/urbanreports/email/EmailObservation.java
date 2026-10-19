package com.project.software.urbanreports.email;

import java.io.EOFException;
import java.io.IOException;
import java.net.ConnectException;
import java.net.UnknownHostException;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpTimeoutException;
import java.security.cert.CertificateException;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import java.util.concurrent.TimeoutException;
import javax.net.ssl.SSLHandshakeException;
import org.slf4j.LoggerFactory;
import org.slf4j.spi.LoggingEventBuilder;

/** Request-local, explicit context. Never stores messages, responses or throwables. */
public final class EmailObservation {
    public static final String LOGGER = "com.project.software.urbanreports.email.observability";
    public enum Operation { GENERIC, ADMIN_INVITATION, ADMIN_RESEND, OCCURRENCE_NOTIFICATION }
    public enum Stage { PREPARATION, VALIDATION, SERIALIZATION, DISPATCH, RESPONSE_VALIDATION }
    public enum Reason {
        accepted, configuration_missing, configuration_invalid, activation_link_preparation_failed,
        notification_link_preparation_failed,
        serialization_failed, dns_resolution_failed, connect_timeout, connect_failed,
        tls_handshake_failed, tls_certificate_validation_failed, request_deadline_exceeded,
        cancelled, interrupted, provider_http_rejected, response_invalid_json,
        response_missing_message_id, connection_closed, io_failure, unknown_failure
    }
    public enum ProviderCode { invalid_parameter, missing_parameter, unknown_provider_code }
    private final UUID id;
    private final long start = System.nanoTime();
    private final Operation operation;
    private Stage stage = Stage.PREPARATION;
    private int attempts;
    private boolean completed;

    public EmailObservation(Operation operation) { this(operation, UUID.randomUUID()); }
    /** sendId must be freshly generated, independent of domain identities. */
    public EmailObservation(Operation operation, UUID sendId) { this.operation = operation; this.id = sendId; }
    public UUID sendId() { return id; }
    public void stage(Stage stage) { this.stage = stage; }
    public void dispatch() {
        stage = Stage.DISPATCH;
        attempts = 1;
        emit(false, "email.send.dispatched", null, null, 0, null);
    }
    public void accepted() { complete(null, Reason.accepted, 201, null); }
    public void failed(EmailSendException.Category category, Reason reason, int status, ProviderCode code) {
        complete(category, reason, status, code);
    }
    private void complete(EmailSendException.Category category, Reason reason, int status, ProviderCode code) {
        if (completed) return;
        completed = true;
        emit(category != null, "email.send.completed", category, reason, status, code);
    }
    private void emit(boolean warn, String event, EmailSendException.Category category, Reason reason,
            int status, ProviderCode code) {
        try {
            var logger = LoggerFactory.getLogger(LOGGER);
            LoggingEventBuilder log = warn ? logger.atWarn() : logger.atDebug();
            log.addKeyValue("event", event).addKeyValue("send_id", id.toString())
                    .addKeyValue("operation", operation.name()).addKeyValue("provider", "brevo")
                    .addKeyValue("stage", stage.name()).addKeyValue("attempts", attempts)
                    .addKeyValue("duration_ms", Math.max(0, (System.nanoTime() - start) / 1_000_000));
            if (reason != null) log.addKeyValue("reason", reason.name()).addKeyValue("outcome",
                    category == null ? "ACCEPTED" : category == EmailSendException.Category.UNCERTAIN ? "UNCERTAIN" : "FAILED");
            if (category != null) log.addKeyValue("category", category.name());
            if (status >= 100 && status <= 599) log.addKeyValue("http_status", status);
            if (code != null) log.addKeyValue("provider_code", code.name());
            log.log("Email transport observation");
        } catch (RuntimeException ignored) { /* Diagnostics must not change delivery or persistence. */ }
    }
    /** Bounded, cycle-safe type inspection; no exception text or suppressed exceptions. */
    static Reason reason(Throwable failure) {
        var seen = Collections.newSetFromMap(new IdentityHashMap<Throwable, Boolean>());
        Reason result = Reason.unknown_failure;
        for (int depth = 0; failure != null && depth < 16 && seen.add(failure); depth++) {
            if (failure instanceof CertificateException) return Reason.tls_certificate_validation_failed;
            if (failure instanceof SSLHandshakeException) result = Reason.tls_handshake_failed;
            else if (failure instanceof UnknownHostException) return Reason.dns_resolution_failed;
            else if (failure instanceof HttpConnectTimeoutException) return Reason.connect_timeout;
            else if (failure instanceof HttpTimeoutException || failure instanceof TimeoutException) return Reason.request_deadline_exceeded;
            else if (failure instanceof InterruptedException) return Reason.interrupted;
            else if (failure instanceof CancellationException) return Reason.cancelled;
            else if (failure instanceof ConnectException && (result == Reason.unknown_failure || result == Reason.io_failure)) result = Reason.connect_failed;
            else if (failure instanceof EOFException && (result == Reason.unknown_failure || result == Reason.io_failure)) result = Reason.connection_closed;
            else if (failure instanceof IOException && result == Reason.unknown_failure) result = Reason.io_failure;
            try { failure = failure.getCause(); } catch (RuntimeException ignored) { break; }
        }
        return result;
    }
    @Override public String toString() { return "EmailObservation[redacted]"; }
}
