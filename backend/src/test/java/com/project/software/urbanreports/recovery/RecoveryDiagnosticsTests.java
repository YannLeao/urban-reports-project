package com.project.software.urbanreports.recovery;

import ch.qos.logback.classic.*;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.project.software.urbanreports.email.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.*;
import org.slf4j.LoggerFactory;
import static org.assertj.core.api.Assertions.*;
import static com.project.software.urbanreports.email.EmailObservation.*;

class RecoveryDiagnosticsTests {
    final Logger logger = (Logger) LoggerFactory.getLogger(EmailObservation.LOGGER);
    final ListAppender<ILoggingEvent> events = new ListAppender<>();
    Level previous;
    @BeforeEach void capture() {
        previous = logger.getLevel(); logger.setLevel(Level.WARN);
        events.start(); logger.addAppender(events);
    }
    @AfterEach void cleanup() { logger.detachAppender(events); events.stop(); logger.setLevel(previous); }

    @Test void repeatedOperationalConditionsAreBoundedAndTransportOwnsItsTerminal() {
        var diagnostics = new RecoveryDiagnostics();
        for (int i = 0; i < 100; i++) {
            diagnostics.failure(new EmailObservation(Operation.PASSWORD_RECOVERY), Stage.PREPARATION,
                    EmailSendException.Category.CONFIGURATION, Reason.recovery_configuration_invalid);
            diagnostics.failure(new EmailObservation(Operation.PASSWORD_RECOVERY), Stage.ADMISSION,
                    EmailSendException.Category.TRANSIENT, Reason.recovery_capacity_exhausted);
        }
        assertThat(events.list).hasSize(2);
        var observation = new EmailObservation(Operation.PASSWORD_RECOVERY);
        observation.failed(EmailSendException.Category.PERMANENT, Reason.provider_http_rejected, 400, null);
        diagnostics.failure(observation, Stage.EXECUTION, EmailSendException.Category.UNCERTAIN, Reason.recovery_task_failed);
        assertThat(events.list).hasSize(3);
        assertThat(events.list).allSatisfy(event -> assertThat(event.getThrowableProxy()).isNull());
    }

    @Test void taskExceptionsNeverLogRawDetailsAndTheSlotCanBeReused() throws Exception {
        var settings = new RecoverySettings("https://example.com", "1", "0", "1", "1000", "30", "30", "10");
        var executor = new RecoveryConfiguration().passwordRecoveryExecutor(settings); executor.initialize();
        var delivery = new RecoveryDelivery(settings, new RecoveryDiagnostics(), executor);
        try {
            delivery.submit(delivery.reserve(), new EmailObservation(Operation.PASSWORD_RECOVERY), () -> {
                throw new IllegalStateException("sentinel@example.com #token=sentinel password=sentinel api-key=sentinel");
            });
            executor.getThreadPoolExecutor().shutdown();
            assertThat(executor.getThreadPoolExecutor().awaitTermination(5, TimeUnit.SECONDS)).isTrue();
            try (var released = delivery.reserve()) { assertThat(released).isNotNull(); }
            assertThat(events.list).hasSize(1);
            var event = events.list.getFirst(); assertThat(event.getThrowableProxy()).isNull();
            assertThat(event.getFormattedMessage()).doesNotContain("sentinel", "#token=", "password=", "api-key=");
            assertThat(event.getKeyValuePairs().toString()).doesNotContain("sentinel", "#token=", "password=", "api-key=");
        } finally { delivery.shutdown(); executor.destroy(); }
    }
}
