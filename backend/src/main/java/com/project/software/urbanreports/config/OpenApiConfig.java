package com.project.software.urbanreports.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    OpenAPI urbanReportsOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Urban Reports API")
                        .description("API for reporting and tracking urban issues")
                        .version("v1"));
    }
}

