package com.project.software.urbanreports.identity;

import java.util.List;
import java.util.Map;

class RegistrationValidationException extends RuntimeException {
    final Map<String, List<String>> fields;
    RegistrationValidationException(Map<String, List<String>> fields) {
        super("Invalid registration fields");
        this.fields = Map.copyOf(fields);
    }
}
