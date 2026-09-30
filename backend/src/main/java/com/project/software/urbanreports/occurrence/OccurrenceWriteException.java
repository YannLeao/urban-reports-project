package com.project.software.urbanreports.occurrence;

public class OccurrenceWriteException extends RuntimeException {
    final org.springframework.http.HttpStatus status;
    final String code;
    public OccurrenceWriteException(org.springframework.http.HttpStatus status, String code) {
        this.status = status; this.code = code;
    }
}
