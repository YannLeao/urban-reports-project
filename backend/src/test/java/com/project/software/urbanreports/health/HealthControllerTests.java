package com.project.software.urbanreports.health;

import com.project.software.urbanreports.support.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
class HealthControllerTests {

    @LocalServerPort
    private int port;

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
    void shouldDocumentHealthEndpointInOpenApiSpecification() {
        var specification = restClient()
                .get()
                .uri("/v3/api-docs")
                .retrieve()
                .body(String.class);

        assertThat(specification)
                .contains("Urban Reports API")
                .contains("/api/health");
    }

    @Test
    void shouldExposeSwaggerUiAtConfiguredPath() {
        var response = restClient()
                .get()
                .uri("/swagger")
                .retrieve()
                .toBodilessEntity();

        assertThat(response.getStatusCode().is3xxRedirection()).isTrue();
        assertThat(response.getHeaders().getLocation())
                .hasPath("/swagger-ui/index.html");
    }

    private RestClient restClient() {
        return RestClient.create("http://localhost:" + port);
    }
}
