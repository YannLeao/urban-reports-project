package com.project.software.urbanreports.health;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/health", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "Health", description = "Application availability")
public class HealthController {

    @GetMapping
    @Operation(summary = "Check API availability")
    @ApiResponse(responseCode = "200", description = "API is available")
    public HealthResponse health() {
        return new HealthResponse("UP");
    }
}

