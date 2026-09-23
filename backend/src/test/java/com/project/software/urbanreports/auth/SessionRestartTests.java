package com.project.software.urbanreports.auth;

import com.project.software.urbanreports.UrbanReportsApplication;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;

class SessionRestartTests {
    @TempDir Path directory;
    final HttpClient client = HttpClient.newHttpClient();
    final ObjectMapper mapper = new ObjectMapper();
    void pem(Path path, String label, byte[] bytes) throws Exception {
        Files.writeString(path, "-----BEGIN " + label + "-----\n" + Base64.getMimeEncoder().encodeToString(bytes)
                + "\n-----END " + label + "-----\n");
    }
    ConfigurableApplicationContext start(PostgreSQLContainer postgres) {
        return new SpringApplicationBuilder(UrbanReportsApplication.class).run(
                "--spring.config.import=", "--spring.profiles.active=prod", "--server.port=0",
                "--image.storage.endpoint=", "--spring.datasource.url=" + postgres.getJdbcUrl(),
                "--spring.datasource.username=" + postgres.getUsername(), "--spring.datasource.password=" + postgres.getPassword(),
                "--auth.jwt.issuer=https://restart.example.com", "--auth.jwt.audience=restart-api", "--auth.jwt.key-id=restart-key",
                "--auth.jwt.private-key-file=" + directory.resolve("private.pem"),
                "--auth.jwt.public-key-file=" + directory.resolve("public.pem"));
    }
    HttpResponse<String> call(ConfigurableApplicationContext context, String path, String body, String token) throws Exception {
        int port = ((WebServerApplicationContext) context).getWebServer().getPort();
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (body != null) request.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body));
        if (token != null) request.header("Authorization", "Bearer " + token);
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
    @Test void sameKeysAndDatabasePreserveActiveAndRevokedSessionsAcrossRestart() throws Exception {
        var generator = KeyPairGenerator.getInstance("RSA"); generator.initialize(2048);
        var keys = generator.generateKeyPair();
        pem(directory.resolve("private.pem"), "PRIVATE KEY", keys.getPrivate().getEncoded());
        pem(directory.resolve("public.pem"), "PUBLIC KEY", keys.getPublic().getEncoded());
        try (var postgres = new PostgreSQLContainer("postgres:17-alpine")) {
            postgres.start(); String active, revoked;
            String credentials = "{\"email\":\"restart@example.com\",\"password\":\"synthetic restart password\"}";
            try (var context = start(postgres)) {
                assertThat(call(context, "/api/auth/register", "{\"name\":\"Restart Test\"," + credentials.substring(1), null).statusCode()).isEqualTo(201);
                var first = call(context, "/api/auth/login", credentials, null);
                var second = call(context, "/api/auth/login", credentials, null);
                assertThat(first.statusCode()).isEqualTo(200); assertThat(second.statusCode()).isEqualTo(200);
                active = mapper.readTree(first.body()).get("accessToken").asString();
                revoked = mapper.readTree(second.body()).get("accessToken").asString();
                assertThat(call(context, "/api/auth/logout", "{}", revoked).statusCode()).isEqualTo(204);
            }
            try (var context = start(postgres)) {
                assertThat(call(context, "/api/auth/me", null, active).statusCode()).isEqualTo(200);
                assertThat(call(context, "/api/auth/me", null, revoked).statusCode()).isEqualTo(401);
            }
        }
    }
    @Test void configurationRejectsMissingWeakOrMismatchedKeys() throws Exception {
        var configuration = new JwtConfiguration();
        assertThatThrownBy(() -> configuration.jwtKeys("", "")).isInstanceOf(IllegalStateException.class);
        var generator = KeyPairGenerator.getInstance("RSA"); generator.initialize(1024);
        var weak = generator.generateKeyPair();
        Path privatePath = directory.resolve("private.pem"), publicPath = directory.resolve("public.pem");
        pem(privatePath, "PRIVATE KEY", weak.getPrivate().getEncoded()); pem(publicPath, "PUBLIC KEY", weak.getPublic().getEncoded());
        assertThatThrownBy(() -> configuration.jwtKeys(privatePath.toString(), publicPath.toString())).isInstanceOf(IllegalStateException.class);
        generator.initialize(2048);
        pem(privatePath, "PRIVATE KEY", generator.generateKeyPair().getPrivate().getEncoded());
        pem(publicPath, "PUBLIC KEY", generator.generateKeyPair().getPublic().getEncoded());
        assertThatThrownBy(() -> configuration.jwtKeys(privatePath.toString(), publicPath.toString())).isInstanceOf(IllegalStateException.class);
    }
}
