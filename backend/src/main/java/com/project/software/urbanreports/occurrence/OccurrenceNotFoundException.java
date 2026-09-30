package com.project.software.urbanreports.occurrence;

import java.util.UUID;

public class OccurrenceNotFoundException extends RuntimeException {
    public OccurrenceNotFoundException(UUID id) {
        super("Occurrence was not found: " + id);
    }
}
