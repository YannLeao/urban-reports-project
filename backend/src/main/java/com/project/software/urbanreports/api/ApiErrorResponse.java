package com.project.software.urbanreports.api;

import java.time.Instant;

public record ApiErrorResponse(Instant timestamp, int status, String error, String message, String path) {
}
