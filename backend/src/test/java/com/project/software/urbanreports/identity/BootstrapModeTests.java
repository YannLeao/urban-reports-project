package com.project.software.urbanreports.identity;

import com.project.software.urbanreports.administration.*;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE,
        properties = {"spring.config.import=", "image.storage.endpoint=", "image.recovery.enabled=false", "spring.application.name=non-web-bootstrap-tests"})
@Import(TestcontainersConfiguration.class)
class BootstrapModeTests {
    @Autowired ApplicationContext context;
    @Test void operationalContextStartsWithoutHttpOrAutomaticBootstrap() {
        assertThat(context).isNotInstanceOf(org.springframework.web.context.WebApplicationContext.class);
        assertThat(context.getBean(BootstrapService.class)).isNotNull();
        assertThat(context.getBeansOfType(BootstrapCommand.class)).isEmpty();
    }
}
