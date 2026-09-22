package com.project.software.urbanreports.documentation;

import org.springframework.boot.test.context.SpringBootTest;

// Exercise the base configuration even when the developer's .env selects a profile.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.config.import=", "spring.profiles.active=", "image.storage.endpoint="})
class DefaultDocumentationTests extends DisabledDocumentationTestSupport {
}
