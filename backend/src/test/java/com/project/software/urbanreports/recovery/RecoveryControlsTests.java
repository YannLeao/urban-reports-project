package com.project.software.urbanreports.recovery;

import com.project.software.urbanreports.email.EmailObservation;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class RecoveryControlsTests {
    static RecoverySettings settings(String workers, String queue, String cap) {
        return new RecoverySettings("https://example.com/", workers, queue, "1", "1000", "30", "30", cap);
    }
    static EmailObservation observation() { return new EmailObservation(EmailObservation.Operation.PASSWORD_RECOVERY); }

    @Test void acceptsCanonicalOriginsAndRejectsUnsafeComponents() {
        for (String origin : List.of("https://example.com", "https://example.com/", "https://example.com:8443/",
                "http://localhost:5173", "http://127.0.0.1:5173/"))
            assertThat(RecoverySettings.parseOrigin(origin)).isNotNull();
        for (String origin : List.of("", " ", "https://", "http://example.com", "https://user:password@example.com",
                "https://example.com/path", "https://example.com//", "https://example.com?token=sentinel",
                "https://example.com#secret", "https://example.com:65536", "https://example.com:0", "//example.com"))
            assertThat(RecoverySettings.parseOrigin(origin)).isNull();
        assertThat(RecoverySettings.parseOrigin("https://example.com/").toString()).isEqualTo("https://example.com");
    }

    @Test void validatesCapacityAndShutdownAgainstEffectiveDeadlineWithoutEchoingValues() {
        assertThatThrownBy(() -> settings("0", "8", "10")).hasMessage("Invalid password recovery numeric configuration");
        assertThatThrownBy(() -> settings("2", "-1", "10")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> settings("2", "8", "100001")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RecoverySettings("", "2", "8", "30", "60000", "30", "30", "10"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test void emailSpacingHourlyWindowAndOriginWindowsHaveExactBoundaries() {
        var clock = mock(Clock.class);
        Instant now = Instant.parse("2026-11-01T00:00:00Z");
        when(clock.instant()).thenReturn(now);
        var limits = new RecoveryLimits(clock, settings("2", "8", "100"));
        assertThat(limits.request("canonical@example.com", "a")).isTrue();
        when(clock.instant()).thenReturn(now.plusSeconds(59));
        assertThat(limits.request("canonical@example.com", "b")).isFalse();
        for (int i = 1; i < 5; i++) {
            when(clock.instant()).thenReturn(now.plusSeconds(i * 60));
            assertThat(limits.request("canonical@example.com", "a")).isTrue();
        }
        when(clock.instant()).thenReturn(now.plusSeconds(3599));
        assertThat(limits.request("canonical@example.com", "a")).isFalse();
        when(clock.instant()).thenReturn(now.plusSeconds(3600));
        assertThat(limits.request("canonical@example.com", "a")).isTrue();
        for (int i = 0; i < 30; i++) {
            assertThat(limits.request("unknown" + i + "@example.com", "origin")).isTrue();
            assertThat(limits.reset("origin")).isTrue();
        }
        assertThat(limits.request("another@example.com", "origin")).isFalse();
        assertThat(limits.reset("origin")).isFalse();
        when(clock.instant()).thenReturn(now.plusSeconds(4200));
        assertThat(limits.request("another@example.com", "origin")).isTrue();
        assertThat(limits.reset("origin")).isTrue();
    }

    @Test void fullMapsDenyNewEntriesWithoutEvictingActiveKeysAndExpire() {
        var clock = mock(Clock.class); Instant now = Instant.parse("2026-11-01T00:00:00Z");
        when(clock.instant()).thenReturn(now);
        var limits = new RecoveryLimits(clock, settings("2", "8", "1"));
        assertThat(limits.request("a@example.com", "a")).isTrue();
        assertThat(limits.request("b@example.com", "a")).isFalse(); // email cap
        assertThat(limits.request("a@example.com", "b")).isFalse(); // origin cap
        assertThat(limits.reset("a")).isTrue();
        assertThat(limits.reset("b")).isFalse();
        when(clock.instant()).thenReturn(now.plusSeconds(3600));
        assertThat(limits.request("b@example.com", "b")).isTrue();
        assertThat(limits.reset("b")).isTrue();
    }

    @Test void concurrentEmailAdmissionsHaveOnlyOneWinner() throws Exception {
        var limits = new RecoveryLimits(Clock.fixed(Instant.now(), ZoneOffset.UTC), settings("2", "8", "100"));
        try (var executor = Executors.newFixedThreadPool(8)) {
            var gate = new CountDownLatch(1);
            var attempts = new ArrayList<Future<Boolean>>();
            for (int i = 0; i < 20; i++) attempts.add(executor.submit(() -> { gate.await(); return limits.request("a@example.com", "a"); }));
            gate.countDown(); int winners = 0;
            for (var attempt : attempts) if (attempt.get(5, TimeUnit.SECONDS)) winners++;
            assertThat(winners).isEqualTo(1);
        }
    }

    @Test void ignoresSpoofedHeadersUnlessSocketPeerIsExplicitlyTrusted() {
        var request = new MockHttpServletRequest(); request.setRemoteAddr("192.0.2.10");
        request.addHeader("X-Forwarded-For", "198.51.100.99, 203.0.113.2");
        assertThat(new RecoveryTrafficOrigin("").resolve(request)).isEqualTo("192.0.2.10");
        assertThat(new RecoveryTrafficOrigin("192.0.2.0/24").resolve(request)).isEqualTo("203.0.113.2");
        assertThat(new RecoveryTrafficOrigin("192.0.2.0/24,203.0.113.2/32").resolve(request)).isEqualTo("198.51.100.99");
        request.removeHeader("X-Forwarded-For"); request.addHeader("X-Forwarded-For", "secret-not-an-ip");
        assertThat(new RecoveryTrafficOrigin("192.0.2.0/24").resolve(request)).isEqualTo("192.0.2.10");
        assertThatThrownBy(() -> new RecoveryTrafficOrigin("*")).hasMessage("Invalid recovery trusted proxy configuration");
    }

    @Test void boundedExecutorReleasesReservationsOnFailureRejectionAndShutdown() throws Exception {
        var settings = settings("1", "1", "10");
        var executor = new RecoveryConfiguration().passwordRecoveryExecutor(settings); executor.initialize();
        var delivery = new RecoveryDelivery(settings, new RecoveryDiagnostics(), executor);
        var started = new CountDownLatch(1); var release = new CountDownLatch(1);
        try {
            var first = delivery.reserve(); var second = delivery.reserve();
            assertThat(first).isNotNull(); assertThat(second).isNotNull(); assertThat(delivery.reserve()).isNull();
            delivery.submit(first, observation(), () -> { started.countDown(); try { release.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); } });
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            delivery.submit(second, observation(), () -> { throw new IllegalStateException("sentinel secret"); });
            release.countDown();
            executor.getThreadPoolExecutor().shutdown();
            assertThat(executor.getThreadPoolExecutor().awaitTermination(5, TimeUnit.SECONDS)).isTrue();
            var availableA = delivery.reserve(); var availableB = delivery.reserve();
            assertThat(availableA).isNotNull(); assertThat(availableB).isNotNull(); assertThat(delivery.reserve()).isNull();
            delivery.submit(availableA, observation(), () -> fail("rejected work must not execute"));
            var restored = delivery.reserve(); assertThat(restored).isNotNull();
            restored.close(); restored.close(); // idempotent release cannot overbook
            var finalSlot = delivery.reserve(); assertThat(finalSlot).isNotNull(); assertThat(delivery.reserve()).isNull();
            finalSlot.close(); availableB.close();
            var committedDuringClose = delivery.reserve();
            delivery.stopAdmission(); assertThat(delivery.reserve()).isNull();
            delivery.submit(committedDuringClose, observation(), () -> fail("shutdown work must not execute"));
        } finally { release.countDown(); delivery.shutdown(); executor.destroy(); }
    }

    @Test void shutdownCancelsQueuedWorkAndInterruptsTheRunningTaskAfterGrace() throws Exception {
        var settings = settings("1", "1", "10");
        var executor = new RecoveryConfiguration().passwordRecoveryExecutor(settings); executor.initialize();
        var delivery = new RecoveryDelivery(settings, new RecoveryDiagnostics(), executor);
        var started = new CountDownLatch(1); var interrupted = new CountDownLatch(1);
        var ranQueued = new java.util.concurrent.atomic.AtomicBoolean();
        try {
            delivery.submit(delivery.reserve(), observation(), () -> {
                started.countDown(); try { new CountDownLatch(1).await(); }
                catch (InterruptedException e) { interrupted.countDown(); Thread.currentThread().interrupt(); }
            });
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            delivery.submit(delivery.reserve(), observation(), () -> ranQueued.set(true));
            delivery.shutdown();
            assertThat(interrupted.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(executor.getThreadPoolExecutor().awaitTermination(5, TimeUnit.SECONDS)).isTrue();
            assertThat(ranQueued).isFalse(); assertThat(delivery.reserve()).isNull();
        } finally { delivery.shutdown(); executor.destroy(); }
    }
}
