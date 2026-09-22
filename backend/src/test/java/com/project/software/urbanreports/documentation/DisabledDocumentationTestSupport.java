package com.project.software.urbanreports.documentation;

import org.junit.jupiter.api.Test;

abstract class DisabledDocumentationTestSupport extends DocumentationTestSupport {
    @Test
    void documentationAndResourcesAreAbsent() throws Exception {
        for (var path : new String[]{"/swagger", "/swagger-ui/", "/swagger-ui.html",
                "/v3/api-docs", "/v3/api-docs.yaml", "/v3/api-docs/swagger-config"}) {
            assertMissing(path);
        }
        for (var asset : ASSETS) {
            assertMissing("/swagger-ui/" + asset);
            assertMissing("/webjars/swagger-ui/" + asset);
            assertMissing("/webjars/swagger-ui/5.32.11/" + asset);
        }
    }
}
