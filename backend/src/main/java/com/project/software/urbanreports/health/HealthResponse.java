package com.project.software.urbanreports.health;

import io.swagger.v3.oas.annotations.media.Schema;

public record HealthResponse(
        @Schema(description = "Current API status", example = "UP") String status) {
}

