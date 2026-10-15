package com.project.software.urbanreports.administration;

import org.springframework.http.HttpStatus;

public class AdministrationException extends RuntimeException {
    public final HttpStatus status;
    public final String code;
    public AdministrationException(HttpStatus status, String code) {
        super("Administrative request could not be completed");
        this.status = status; this.code = code;
    }
}
