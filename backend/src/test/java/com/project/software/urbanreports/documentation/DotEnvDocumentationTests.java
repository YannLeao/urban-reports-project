package com.project.software.urbanreports.documentation;

import org.springframework.boot.test.context.SpringBootTest;

// Import a .env as properties, exactly as local startup does; no @ActiveProfiles.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.config.import=classpath:documentation-dev.env[.properties]",
                "image.storage.endpoint="})
class DotEnvDocumentationTests extends DevelopmentDocumentationTestSupport {
}
