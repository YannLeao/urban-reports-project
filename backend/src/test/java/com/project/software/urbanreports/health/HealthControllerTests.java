package com.project.software.urbanreports.health;

import com.project.software.urbanreports.support.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "app.cors.allowed-origins=http://localhost:5173,https://frontend.example.com")
@Import(TestcontainersConfiguration.class)
class HealthControllerTests {

    @LocalServerPort
    private int port;

    @Test
    void shouldAllowConfiguredFrontendOrigins() {
        for (var origin : new String[]{"http://localhost:5173", "https://frontend.example.com"}) {
            var response = restClient().get().uri("/api/health")
                    .header("Origin", origin).retrieve().toEntity(HealthResponse.class);

            assertThat(response.getStatusCode().value()).isEqualTo(200);
            assertThat(response.getHeaders().getFirst("Access-Control-Allow-Origin"))
                    .isEqualTo(origin);
        }
    }

    @Test
    void shouldRejectUnconfiguredFrontendOrigin() {
        var status = restClient().get().uri("/api/health")
                .header("Origin", "https://untrusted.example.com")
                .exchange((request, response) -> response.getStatusCode().value());

        assertThat(status).isEqualTo(403);
    }

    @Test
    void shouldAllowCorsPreflightFromConfiguredFrontend() {
        var response = restClient().options().uri("/api/health")
                .header("Origin", "https://frontend.example.com")
                .header("Access-Control-Request-Method", "GET")
                .retrieve().toBodilessEntity();

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getFirst("Access-Control-Allow-Origin"))
                .isEqualTo("https://frontend.example.com");
    }

    @Test
    void shouldReturnApiHealth() {
        var response = restClient()
                .get()
                .uri("/api/health")
                .retrieve()
                .toEntity(HealthResponse.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isEqualTo(new HealthResponse("UP"));
    }

    @Test
    void headHasNoBodyOverHttp() {
        var response = restClient().head().uri("/api/health").retrieve().toEntity(String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isNullOrEmpty();
        assertThat(response.getHeaders().getFirst("Location")).isNull();
        assertThat(response.getHeaders().getFirst("WWW-Authenticate")).isNull();
    }

    private RestClient restClient() {
        var httpClient = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        return RestClient.builder()
                .baseUrl("http://localhost:" + port)
                .requestFactory(new JdkClientHttpRequestFactory(httpClient))
                .build();
    }
}
