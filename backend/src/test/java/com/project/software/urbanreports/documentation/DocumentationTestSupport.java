package com.project.software.urbanreports.documentation;

import com.project.software.urbanreports.support.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.config.import=", "image.storage.endpoint="})
@Import(TestcontainersConfiguration.class)
abstract class DocumentationTestSupport {
    @LocalServerPort
    private int port;

    // Concrete resources from swagger-ui 5.32.11, resolved by springdoc 3.1.0.
    static final String[] ASSETS = {"index.html", "swagger-initializer.js", "swagger-ui.css",
            "swagger-ui-bundle.js", "swagger-ui-standalone-preset.js", "oauth2-redirect.html"};

    HttpResponse<String> get(String path) throws Exception {
        return HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build()
                .send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build(),
                        HttpResponse.BodyHandlers.ofString());
    }

    void assertMissing(String path) throws Exception {
        var response = get(path);
        assertThat(response.statusCode()).as(path).isEqualTo(404);
        assertThat(response.headers().firstValue("Location")).isEmpty();
    }

    @Test
    void healthRemainsAvailable() throws Exception {
        var response = get("/api/health");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("\"status\":\"UP\"");
    }
}
