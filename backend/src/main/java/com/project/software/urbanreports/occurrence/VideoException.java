package com.project.software.urbanreports.occurrence;

import org.springframework.http.HttpStatus;

public class VideoException extends RuntimeException {
    final HttpStatus status;
    final String code;
    VideoException(HttpStatus status, String code) { super(code); this.status = status; this.code = code; }
    static VideoException invalid() { return new VideoException(HttpStatus.BAD_REQUEST, "INVALID_VIDEO"); }
    static VideoException unavailable() { return new VideoException(HttpStatus.SERVICE_UNAVAILABLE, "VIDEO_VALIDATION_UNAVAILABLE"); }
}
