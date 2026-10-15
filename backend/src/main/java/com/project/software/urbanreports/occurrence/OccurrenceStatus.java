package com.project.software.urbanreports.occurrence;

public enum OccurrenceStatus {
    PENDING, IN_ANALYSIS, RESOLVED, REJECTED;

    public boolean canTransitionTo(OccurrenceStatus target) {
        return this == PENDING && (target == IN_ANALYSIS || target == REJECTED)
                || this == IN_ANALYSIS && (target == RESOLVED || target == REJECTED);
    }
}
