package com.project.software.urbanreports.storage.infrastructure;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.net.URI;

@Validated
@ConfigurationProperties("image.storage")
public record R2StorageProperties(
        URI endpoint,
        @NotBlank String region,
        @NotBlank String bucket,
        @NotBlank String accessKey,
        @NotBlank String secretKey
) {
}
