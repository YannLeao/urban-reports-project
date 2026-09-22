package com.project.software.urbanreports.documentation;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

abstract class DevelopmentDocumentationTestSupport extends DocumentationTestSupport {
    @Test
    void swaggerLoadsTheApplicationsSpecification() throws Exception {
        var redirect = get("/swagger");
        assertThat(redirect.statusCode()).isEqualTo(302);
        assertThat(redirect.headers().firstValue("Location")).contains("/swagger-ui/index.html");
        var html = get(redirect.headers().firstValue("Location").orElseThrow());
        assertThat(html.statusCode()).isEqualTo(200);
        assertThat(html.body()).contains("swagger-ui.css", "swagger-ui-bundle.js", "swagger-initializer.js");
        for (var asset : ASSETS) {
            assertThat(get("/swagger-ui/" + asset).statusCode()).as(asset).isEqualTo(200);
        }
        var initializer = get("/swagger-ui/swagger-initializer.js");
        assertThat(initializer.body()).contains("/v3/api-docs/swagger-config").doesNotContain("petstore.swagger.io");
        var config = get("/v3/api-docs/swagger-config");
        assertThat(config.statusCode()).isEqualTo(200);
        assertThat(config.body()).contains("\"url\":\"/v3/api-docs\"");
        for (var path : new String[]{"/v3/api-docs", "/v3/api-docs.yaml"}) {
            var response = get(path);
            assertThat(response.statusCode()).as(path).isEqualTo(200);
            assertThat(response.body()).contains("Urban Reports API", "/api/health", "/api/storage/images");
        }
        assertMissing("/swagger-ui.html");
        assertMissing("/swagger-ui/");
    }
}
