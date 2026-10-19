package com.project.software.urbanreports.notification.email;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.project.software.urbanreports.email.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.slf4j.LoggerFactory;
import org.springframework.boot.logging.logback.StructuredLogEncoder;
import org.springframework.core.env.StandardEnvironment;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.project.software.urbanreports.notification.email.NotificationEmailStore.*;

class NotificationEmailWorkerTests {
    Logger logger = (Logger) LoggerFactory.getLogger(EmailObservation.LOGGER);
    ListAppender<ILoggingEvent> events;
    Level previous;
    NotificationEmailStore store;
    NotificationEmailSettings settings;
    NotificationEmailDiagnostics diagnostics;
    Clock clock = Clock.fixed(Instant.parse("2026-10-19T12:00:00Z"), ZoneOffset.UTC);
    @BeforeEach void setup() {
        previous = logger.getLevel(); logger.setLevel(Level.DEBUG);
        events = new ListAppender<>(); events.setContext(logger.getLoggerContext()); events.start(); logger.addAppender(events);
        store = mock(NotificationEmailStore.class);
        settings = new NotificationEmailSettings("true", "https://frontend.example", "60000", "3", "60000", "10000");
        diagnostics = new NotificationEmailDiagnostics();
    }
    @AfterEach void cleanup() { Thread.interrupted(); logger.detachAppender(events); events.stop(); logger.setLevel(previous); }
    NotificationEmailWorker worker(TransactionalEmailSender sender) { return new NotificationEmailWorker(store, sender, settings, diagnostics, clock); }
    void reserve() {
        when(store.reserve(any(), anyLong(), any())).thenAnswer(call -> Optional.of(new Claim(UUID.randomUUID(), UUID.randomUUID(), call.getArgument(2))));
        when(store.recipient(any(), any())).thenReturn(Optional.of(new Recipient(UUID.randomUUID(), "secret-address@example.com", true)));
        when(store.complete(any(), any(), any(), any(), anyInt(), any())).thenReturn(true);
    }
    String json() {
        var context = logger.getLoggerContext(); context.putObject(org.springframework.core.env.Environment.class.getName(), new StandardEnvironment());
        var encoder = new StructuredLogEncoder(); encoder.setContext(context); encoder.setFormat("logstash"); encoder.start();
        try {
            var output = new StringBuilder();
            for (var event : events.list) {
                assertThat(event.getThrowableProxy()).isNull();
                String line = new String(encoder.encode(event), StandardCharsets.UTF_8);
                assertThat(line.lines().count()).isEqualTo(1); output.append(line);
            }
            return output.toString();
        } finally { encoder.stop(); }
    }
    @Test void emptyPollingAndSuccessAreSilentAtWarnAndFailuresAreLimitedAndSanitized() {
        var sender = mock(TransactionalEmailSender.class); var worker = worker(sender);
        worker.poll(); worker.poll(); assertThat(events.list).isEmpty();
        reserve();
        logger.setLevel(Level.WARN);
        when(sender.send(any(), any())).thenReturn(new EmailSendResult("private-message-id"));
        worker.poll(); assertThat(events.list).isEmpty();
        doThrow(new IllegalStateException("secret-config-marker\r\nspoof")).when(sender).validateConfiguration();
        for (int i = 0; i < 20; i++) worker.poll();
        assertThat(events.list).hasSize(1); assertThat(json()).contains("CONFIGURATION").doesNotContain("secret-", "spoof", "private-message-id");
    }
    @Test void eachAttemptHasOneTerminalAndFreshSendIdAndOperationalFailureIsSeparate() {
        reserve();
        TransactionalEmailSender sender = new TransactionalEmailSender() {
            public EmailSendResult send(EmailMessage message) { throw new AssertionError("context required"); }
            public EmailSendResult send(EmailMessage message, EmailObservation observation) {
                observation.dispatch();
                observation.failed(EmailSendException.Category.TRANSIENT, EmailObservation.Reason.provider_http_rejected, 503, EmailObservation.ProviderCode.unknown_provider_code);
                throw new EmailSendException(EmailSendException.Category.TRANSIENT, 503);
            }
        };
        worker(sender).poll();
        assertThat(events.list).hasSize(6); // 3 items, dispatch + terminal, no second terminal from worker
        assertThat(events.list.stream().flatMap(e -> e.getKeyValuePairs().stream()).filter(p -> p.key.equals("send_id")).map(p -> p.value).distinct()).hasSize(3);
        assertThat(json()).contains("OCCURRENCE_NOTIFICATION", "TRANSIENT").doesNotContain("secret-", "frontend.example", "notification_id", "owner_token");
        events.list.clear();
        doThrow(new IllegalStateException("secret-db-marker")).when(store).complete(any(), any(), any(), any(), anyInt(), any());
        worker(sender).poll();
        assertThat(events.list).hasSize(3); // dispatch, terminal, operational
        assertThat(json()).contains("RESULT_NOT_SAVED", "notification.email.operational").doesNotContain("secret-db-marker");
    }
    @Test void interruptionAndStopDoNotReserveFurtherWork() {
        reserve();
        var worker = worker(message -> { Thread.currentThread().interrupt(); throw new EmailSendException(EmailSendException.Category.UNCERTAIN, 0); });
        worker.poll();
        assertThat(Thread.currentThread().isInterrupted()).isTrue();
        verify(store, times(1)).reserve(any(), anyLong(), any());
        verify(store).complete(any(), eq(State.UNCERTAIN), any(), eq(EmailSendException.Category.UNCERTAIN), anyInt(), any());
        Thread.interrupted(); worker.stop(); worker.poll();
        verify(store, times(1)).reserve(any(), anyLong(), any());
    }
    @Test void repeatedDatabaseFailureIsRateLimitedWithoutRawCause() {
        when(store.expire(any(), anyInt())).thenThrow(new IllegalStateException("secret-db\r\nspoof"));
        var worker = worker(mock(TransactionalEmailSender.class));
        for (int i = 0; i < 20; i++) worker.poll();
        assertThat(events.list).hasSize(1); assertThat(json()).contains("DATABASE").doesNotContain("secret-db", "spoof");
    }
}
