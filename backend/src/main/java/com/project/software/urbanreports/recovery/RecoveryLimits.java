package com.project.software.urbanreports.recovery;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Component;

/** Local sliding windows. Full maps fail closed, without evicting live entries. Never log keys. */
@Component
public final class RecoveryLimits {
    private final Clock clock;
    private final Window emails, requests, resets;

    public RecoveryLimits(Clock clock, RecoverySettings settings) {
        this.clock = clock;
        emails = new Window(Duration.ofHours(1), 5, settings.maxEntries);
        requests = new Window(Duration.ofMinutes(10), settings.requestLimit, settings.maxEntries);
        resets = new Window(Duration.ofMinutes(10), settings.resetLimit, settings.maxEntries);
    }

    public synchronized boolean request(String canonicalEmail, String origin) {
        Instant now = clock.instant();
        if (!requests.admit(origin, now, Duration.ZERO)) return false;
        return emails.admit(canonicalEmail, now, Duration.ofSeconds(60));
    }

    public synchronized boolean reset(String origin) {
        return resets.admit(origin, clock.instant(), Duration.ZERO);
    }

    private static final class Window {
        final Duration duration;
        final int limit, maxEntries;
        final Map<String, ArrayDeque<Instant>> entries = new HashMap<>();
        Instant cleaned;
        Window(Duration duration, int limit, int maxEntries) {
            this.duration = duration; this.limit = limit; this.maxEntries = maxEntries;
        }
        boolean admit(String key, Instant now, Duration spacing) {
            if (cleaned == null || !now.isBefore(cleaned.plusSeconds(60)) || entries.size() >= maxEntries) {
                entries.values().removeIf(times -> { expire(times, now); return times.isEmpty(); });
                cleaned = now;
            }
            var times = entries.get(key);
            if (times == null) {
                if (entries.size() >= maxEntries) return false;
                times = new ArrayDeque<>(); entries.put(key, times);
            }
            expire(times, now);
            if (times.size() >= limit || !spacing.isZero() && !times.isEmpty() && now.isBefore(times.getLast().plus(spacing))) return false;
            times.addLast(now);
            return true;
        }
        void expire(ArrayDeque<Instant> times, Instant now) {
            while (!times.isEmpty() && !times.getFirst().plus(duration).isAfter(now)) times.removeFirst();
        }
    }
}
