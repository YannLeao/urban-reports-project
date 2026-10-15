package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.identity.RegistrationValidation;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;

/** Domain rules shared by the future authorized moderation command. */
public record OccurrenceTransition(OccurrenceStatus target, String reason) {
    public OccurrenceTransition validated() {
        if (target == null) throw invalid("target");
        if (target != OccurrenceStatus.REJECTED) {
            if (reason != null) throw invalid("reason");
            return this;
        }
        String cleaned = RegistrationValidation.trim(reason);
        int length = cleaned.codePointCount(0, cleaned.length());
        if (length < 10 || length > 500 || cleaned.codePoints().anyMatch(c ->
                c == 0 || c >= 0xD800 && c <= 0xDFFF)) throw invalid("reason");
        return new OccurrenceTransition(target, cleaned);
    }

    public void check(OccurrenceStatus source, long version, String match) {
        if (match == null) throw new OccurrenceWriteException(HttpStatus.PRECONDITION_REQUIRED, "VERSION_REQUIRED");
        if (!match.equals("\"" + version + "\""))
            throw new OccurrenceWriteException(HttpStatus.PRECONDITION_FAILED, "VERSION_CHANGED");
        if (source == null || !source.canTransitionTo(target))
            throw new OccurrenceWriteException(HttpStatus.CONFLICT, "INVALID_TRANSITION");
    }

    private static OccurrenceValidationException invalid(String field) {
        return new OccurrenceValidationException(Map.of(field, List.of("INVALID_TRANSITION_" + field.toUpperCase(java.util.Locale.ROOT))));
    }
}
