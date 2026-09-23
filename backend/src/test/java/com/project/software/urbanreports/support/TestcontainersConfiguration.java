package com.project.software.urbanreports.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    org.springframework.test.context.DynamicPropertyRegistrar jwtProperties() {
        return registry -> {
            registry.add("auth.jwt.issuer", () -> "https://test.example.com");
            registry.add("auth.jwt.audience", () -> "test-api");
            registry.add("auth.jwt.key-id", () -> "test-key");
        };
    }

    @Bean
    com.project.software.urbanreports.auth.JwtConfiguration.Keys testJwtKeys() throws Exception {
        var generator = java.security.KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        var pair = generator.generateKeyPair();
        return new com.project.software.urbanreports.auth.JwtConfiguration.Keys(
                (java.security.interfaces.RSAPublicKey) pair.getPublic(),
                (java.security.interfaces.RSAPrivateKey) pair.getPrivate());
    }

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgresContainer() {
        return new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"));
    }
}
