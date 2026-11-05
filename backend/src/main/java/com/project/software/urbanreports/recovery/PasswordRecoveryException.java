package com.project.software.urbanreports.recovery;

import org.springframework.http.HttpStatus;

public class PasswordRecoveryException extends RuntimeException {
    final HttpStatus status;
    final String code;

    PasswordRecoveryException(HttpStatus status, String code) {
        super(code);
        this.status = status; this.code = code;
    }
}