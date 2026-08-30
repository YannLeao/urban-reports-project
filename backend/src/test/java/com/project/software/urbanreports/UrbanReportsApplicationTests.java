package com.project.software.urbanreports;

import com.project.software.urbanreports.support.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class UrbanReportsApplicationTests {

    @Test
    void contextLoads() {
    }
}
