package com.project.software.urbanreports.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Prevents Boot's generic WebJar handler from exposing Swagger when its UI is disabled. */
@RestController
@ConditionalOnProperty(name = "springdoc.swagger-ui.enabled", havingValue = "false", matchIfMissing = true)
class DisabledSwaggerResourcesController {

    @RequestMapping("/webjars/swagger-ui/**")
    ResponseEntity<Void> swaggerResourceNotFound() {
        return ResponseEntity.notFound().build();
    }
}
