package com.project.software.urbanreports.notification.email;

import com.project.software.urbanreports.email.EmailObservation;
import java.time.Duration;
import java.util.EnumMap;
import java.util.UUID;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Bounded operational events, deliberately separate from transport completion. */
@Component
public final class NotificationEmailDiagnostics {
    public enum Condition { CONFIGURATION, DATABASE, RESULT_NOT_SAVED, OWNERSHIP_LOST, LEASE_EXPIRED, SCHEDULER }
    private final EnumMap<Condition, Long> last = new EnumMap<>(Condition.class);
    public synchronized void warn(Condition condition, UUID sendId) {
        long now = System.nanoTime();
        Long previous = last.get(condition);
        // Configuration is immutable: once per process. Other incidents repeat at most every five minutes.
        if (previous != null && (condition == Condition.CONFIGURATION
                || now - previous < Duration.ofMinutes(5).toNanos())) return;
        last.put(condition, now);
        try {
            var event = LoggerFactory.getLogger(EmailObservation.LOGGER).atWarn()
                    .addKeyValue("event", "notification.email.operational")
                    .addKeyValue("condition", condition.name());
            if (sendId != null) event.addKeyValue("send_id", sendId.toString());
            event.log("Notification email operation requires attention");
        } catch (RuntimeException ignored) { /* Logging cannot change state. */ }
    }
}
