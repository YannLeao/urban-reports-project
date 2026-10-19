package com.project.software.urbanreports.notification.email;

import com.project.software.urbanreports.email.*;
import com.project.software.urbanreports.storage.application.UploadJournal;
import com.project.software.urbanreports.storage.infrastructure.UploadRecoverySchedule;
import java.io.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.scheduling.TaskScheduler;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class NotificationEmailConfigurationTests {
    @Test void validatesStructuralLimitsAndSanitizesAllValues() {
        for (String value : List.of("0", "3600001", "secret-marker", "-1"))
            assertThatThrownBy(() -> new NotificationEmailSettings("false", "", value, "3", "60000", "10000"))
                    .isInstanceOf(IllegalArgumentException.class).hasMessage("Invalid notification email numeric/switch configuration");
        assertThatThrownBy(() -> new NotificationEmailSettings("false", "", "60000", "21", "60000", "10000")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new NotificationEmailSettings("false", "", "60000", "3", "39999", "10000")).isInstanceOf(IllegalArgumentException.class);
        for (String origin : List.of("", "https://example.com/", "https://user@example.com", "https://example.com?q=secret",
                "https://example.com#secret", "https://example.com/path", "http://example.com", "secret-marker\r\n")) {
            var settings = new NotificationEmailSettings("true", origin, "60000", "3", "60000", "10000");
            assertThatThrownBy(settings::validatedOrigin).hasMessage("Invalid notification frontend origin");
            var store = mock(NotificationEmailStore.class); var sender = mock(TransactionalEmailSender.class);
            var worker = new NotificationEmailWorker(store, sender, settings, new NotificationEmailDiagnostics(), Clock.systemUTC());
            worker.poll(); worker.poll();
            verify(store, never()).reserve(any(), anyLong(), any()); verifyNoInteractions(sender);
        }
        for (String origin : List.of("https://frontend.example", "http://localhost:5173", "http://127.0.0.1:5173"))
            assertThat(new NotificationEmailSettings("true", origin, "60000", "3", "60000", "10000").validatedOrigin().toString()).isEqualTo(origin);
    }

    @Test void schedulersRemainIndependentForEverySwitchCombination() throws Exception {
        for (boolean images : List.of(false, true)) for (boolean emails : List.of(false, true)) {
            try (var context = new AnnotationConfigApplicationContext()) {
                context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("test", Map.of(
                        "notifications.email.enabled", Boolean.toString(emails), "image.recovery.enabled", Boolean.toString(images))));
                context.registerBean("notificationEmailSettings", NotificationEmailSettings.class,
                        () -> new NotificationEmailSettings(Boolean.toString(emails), "", "3600000", "3", "60000", "10000"));
                context.registerBean(NotificationEmailWorker.class, () -> mock(NotificationEmailWorker.class));
                context.registerBean(NotificationEmailDiagnostics.class, NotificationEmailDiagnostics::new);
                context.registerBean(UploadJournal.class, () -> mock(UploadJournal.class));
                context.register(NotificationEmailSchedule.class, UploadRecoverySchedule.class);
                context.refresh();
                assertThat(context.containsBean("notificationEmailScheduler")).isEqualTo(emails);
                assertThat(context.containsBean("uploadRecoveryScheduler")).isEqualTo(images);
                for (var entry : context.getBeansOfType(TaskScheduler.class).entrySet()) {
                    var result = new CompletableFuture<String>();
                    entry.getValue().schedule(() -> result.complete(Thread.currentThread().getName()), Instant.now());
                    assertThat(result.get(5, TimeUnit.SECONDS)).startsWith(entry.getKey().equals("notificationEmailScheduler") ? "notification-email-" : "upload-recovery-");
                }
            }
        }
    }

    @Test void helpAndInvalidCommandsNeverConstructDatabaseOrApplicationContext() {
        var output = new ByteArrayOutputStream(); var out = new PrintStream(output);
        assertThat(NotificationEmailCommand.execute(new String[]{"help"}, () -> { throw new AssertionError(); }, out)).isZero();
        for (String[] args : List.of(new String[]{"unknown-secret"}, new String[]{"counts", "--password=secret"},
                new String[]{"list", "--state=FAILED", "--state=FAILED"}))
            assertThat(NotificationEmailCommand.execute(args, () -> { throw new AssertionError(); }, out)).isEqualTo(2);
        assertThat(output.toString()).doesNotContain("unknown-secret", "--password=secret");
    }

    @Test void operationalMainExitsWithoutSpringEvenWithInvalidWebDatabaseAndKeyConfiguration() throws Exception {
        var process = new ProcessBuilder(System.getProperty("java.home") + "/bin/java", "-cp", System.getProperty("java.class.path"),
                "com.project.software.urbanreports.UrbanReportsApplication", "--notification-email-ops", "help");
        process.environment().put("DB_URL", "jdbc:postgresql://127.0.0.1:1/never-connect");
        process.environment().put("AUTH_JWT_PRIVATE_KEY_FILE", "/nonexistent/never-read.pem");
        process.environment().put("NOTIFICATIONS_EMAIL_ENABLED", "true");
        var child = process.redirectErrorStream(true).start();
        try {
            assertThat(child.waitFor(10, TimeUnit.SECONDS)).isTrue();
            assertThat(child.exitValue()).isZero();
            String output = new String(child.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            assertThat(output).contains("counts | list").doesNotContain("Spring Boot", "Flyway", "Tomcat", "never-connect", "never-read");
        } finally { child.destroyForcibly(); }
    }
}
