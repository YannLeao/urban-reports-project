package com.project.software.urbanreports.storage.infrastructure;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration(proxyBeanMethods = false)
@ConditionalOnExpression("'${image.storage.endpoint:}'.length() > 0")
@EnableConfigurationProperties(R2StorageProperties.class)
public class R2StorageConfiguration {

    @Bean
    S3Client imageStorageS3Client(R2StorageProperties properties) {
        return S3Client.builder()
                .httpClientBuilder(software.amazon.awssdk.http.apache.ApacheHttpClient.builder()
                    .maxConnections(8).connectionAcquisitionTimeout(java.time.Duration.ofSeconds(2))
                    .connectionTimeout(java.time.Duration.ofSeconds(5)).socketTimeout(java.time.Duration.ofSeconds(5)))
                .endpointOverride(properties.endpoint())
                .region(Region.of(properties.region()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(properties.accessKey(), properties.secretKey())))
                .overrideConfiguration(config -> config
                        .apiCallTimeout(java.time.Duration.ofSeconds(60))
                        .apiCallAttemptTimeout(java.time.Duration.ofSeconds(25))
                        .retryStrategy(software.amazon.awssdk.retries.StandardRetryStrategy.builder()
                                .maxAttempts(2).build()))
                .forcePathStyle(true)
                .build();
    }

    @Bean
    R2ImageStorage r2ImageStorage(S3Client s3Client, R2StorageProperties properties) {
        return new R2ImageStorage(s3Client, properties);
    }
}
