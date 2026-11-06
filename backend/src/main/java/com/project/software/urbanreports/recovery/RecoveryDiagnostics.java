package com.project.software.urbanreports.recovery;

import com.project.software.urbanreports.email.*;
import java.time.Duration;
import java.util.EnumMap;
import org.springframework.stereotype.Component;

/** Reuses the shared logger/vocabulary, at most one operational warning per reason/5 minutes. */
@Component
public final class RecoveryDiagnostics {
    private final EnumMap<EmailObservation.Reason, Long> last = new EnumMap<>(EmailObservation.Reason.class);
    public synchronized void failure(EmailObservation observation, EmailObservation.Stage stage,
            EmailSendException.Category category, EmailObservation.Reason reason) {
        if (observation.completed()) return; // Transport owns its terminal result.
        long now = System.nanoTime();
        Long previous = last.get(reason);
        if (previous != null && (reason == EmailObservation.Reason.recovery_configuration_invalid
                || now - previous < Duration.ofMinutes(5).toNanos())) return;
        last.put(reason, now);
        observation.stage(stage);
        observation.failed(category, reason, 0, null);
    }
}
