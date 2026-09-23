package com.project.software.urbanreports.config;

import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class CorsConfig {

    @Bean
    UrlBasedCorsConfigurationSource corsConfigurationSource(
            @Value("${app.cors.allowed-origins}") String[] allowedOrigins) {
        if (Arrays.stream(allowedOrigins).anyMatch(origin -> origin.contains("*"))) {
            throw new IllegalArgumentException("CORS requires exact origins");
        }
        var configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.asList(allowedOrigins));
        configuration.setAllowedMethods(List.of("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Content-Type", "Authorization"));
        configuration.setAllowCredentials(false);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
