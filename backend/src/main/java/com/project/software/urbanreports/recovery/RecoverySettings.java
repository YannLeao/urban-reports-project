package com.project.software.urbanreports.recovery;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public final class RecoverySettings {
    final URI origin;
    final int workers, queue, shutdownSeconds, requestLimit, resetLimit, maxEntries;

    public RecoverySettings(@Value("${recovery.frontend-origin:}") String origin,
            @Value("${recovery.workers:2}") String workers,
            @Value("${recovery.queue-capacity:8}") String queue,
            @Value("${recovery.shutdown-seconds:30}") String shutdown,
            @Value("${email.request-timeout-ms:10000}") String deadline,
            @Value("${recovery.request-origin-limit:30}") String requestLimit,
            @Value("${recovery.reset-origin-limit:30}") String resetLimit,
            @Value("${recovery.limiter-max-entries:10000}") String maxEntries) {
        try {
            this.workers = bounded(workers, 1, 8);
            this.queue = bounded(queue, 0, 64);
            this.shutdownSeconds = bounded(shutdown, 1, 120);
            if (bounded(deadline, 1, 60000) > shutdownSeconds * 1000) throw new IllegalArgumentException();
            this.requestLimit = bounded(requestLimit, 1, 100);
            this.resetLimit = bounded(resetLimit, 1, 100);
            this.maxEntries = bounded(maxEntries, 1, 100000);
        } catch (RuntimeException invalid) {
            throw new IllegalArgumentException("Invalid password recovery numeric configuration");
        }
        this.origin = parseOrigin(origin);
    }

    static URI parseOrigin(String value) {
        try {
            URI uri = URI.create(value);
            boolean local = "localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost());
            if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null
                    || uri.getFragment() != null || uri.getPort() > 65535 || uri.getPort() == 0
                    || !(uri.getRawPath().isEmpty() || uri.getRawPath().equals("/"))
                    || !("https".equals(uri.getScheme()) || local && "http".equals(uri.getScheme()))) return null;
            return URI.create(value.endsWith("/") ? value.substring(0, value.length() - 1) : value);
        } catch (RuntimeException invalid) { return null; }
    }

    private static int bounded(String value, int min, int max) {
        int number = Integer.parseInt(value);
        if (number < min || number > max) throw new IllegalArgumentException();
        return number;
    }

    @Override public String toString() { return "RecoverySettings[redacted]"; }
}
