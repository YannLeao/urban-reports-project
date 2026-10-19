package com.project.software.urbanreports.notification.email;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public final class NotificationEmailSettings {
    final boolean enabled;
    final String origin;
    final long intervalMs, leaseMs;
    final int batchSize;

    public NotificationEmailSettings(@Value("${notifications.email.enabled:false}") String enabled,
            @Value("${notifications.email.frontend-origin:}") String origin,
            @Value("${notifications.email.poll-interval-ms:60000}") String interval,
            @Value("${notifications.email.batch-size:3}") String batch,
            @Value("${notifications.email.lease-ms:60000}") String lease,
            @Value("${email.request-timeout-ms:10000}") String deadline) {
        try {
            if (!enabled.equals("true") && !enabled.equals("false")) throw new IllegalArgumentException();
            this.enabled = Boolean.parseBoolean(enabled);
            this.intervalMs = bounded(interval, 1000, 3600000);
            this.batchSize = (int) bounded(batch, 1, 20);
            this.leaseMs = bounded(lease, 1000, 3600000);
            if (leaseMs < bounded(deadline, 1, 60000) + 30000) throw new IllegalArgumentException();
        } catch (RuntimeException invalid) {
            throw new IllegalArgumentException("Invalid notification email numeric/switch configuration");
        }
        this.origin = origin;
    }

    private static long bounded(String value, long min, long max) {
        long number = Long.parseLong(value);
        if (number < min || number > max) throw new IllegalArgumentException();
        return number;
    }

    public long intervalMs() { return intervalMs; }

    public URI validatedOrigin() {
        try {
            URI uri = URI.create(origin);
            boolean loopback = "localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost());
            if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                    || uri.getRawPath() != null && !uri.getRawPath().isEmpty()
                    || !("https".equals(uri.getScheme()) || loopback && "http".equals(uri.getScheme())))
                throw new IllegalArgumentException();
            return uri;
        } catch (RuntimeException invalid) { throw new IllegalArgumentException("Invalid notification frontend origin"); }
    }

    @Override public String toString() { return "NotificationEmailSettings[redacted]"; }
}
