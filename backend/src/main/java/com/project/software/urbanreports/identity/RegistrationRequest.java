package com.project.software.urbanreports.identity;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record RegistrationRequest(String name, String email, String password) {
    @Override public String toString() { return "RegistrationRequest[redacted]"; }
}
