package com.project.software.urbanreports.occurrence;

public enum OccurrenceStatus {
    PENDING, ACCEPTED, RESOLVED, REJECTED;

    public boolean canTransitionTo(OccurrenceStatus target) {
        return this == PENDING && (target == ACCEPTED || target == REJECTED)
                || this == ACCEPTED && target == RESOLVED;
    }
}
