package com.project.software.urbanreports.occurrence;

import java.util.Map;

public class OccurrenceValidationException extends RuntimeException {
    private final Map<String, java.util.List<String>> fields;

    public OccurrenceValidationException(Map<String, java.util.List<String>> fields) {
        super("Occurrence fields are invalid");
        this.fields = fields;
    }

    public Map<String, java.util.List<String>> fields() { return fields; }
}
