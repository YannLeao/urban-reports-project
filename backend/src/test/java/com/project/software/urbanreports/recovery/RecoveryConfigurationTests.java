package com.project.software.urbanreports.recovery;

import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import static org.assertj.core.api.Assertions.*;

class RecoveryConfigurationTests {
    @TempDir Path directory;
    @Test void importedUppercasePropertiesSupportFallbackDedicatedAndInvalidOverride() throws Exception {
        Path env = directory.resolve("recovery.env");
        for (String dedicated : new String[] {"", "RECOVERY_FRONTEND_ORIGIN=https://dedicated.example.com/\n",
                "RECOVERY_FRONTEND_ORIGIN=\n", "RECOVERY_FRONTEND_ORIGIN=http://invalid.example.com\n"}) {
            Files.writeString(env, "ADMIN_FRONTEND_ORIGIN=https://fallback.example.com\n" + dedicated);
            new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
                    .withPropertyValues("spring.config.import=file:" + env + "[.properties]")
                    .withBean(RecoverySettings.class).run(context -> {
                        assertThat(context).hasNotFailed();
                        var settings = context.getBean(RecoverySettings.class);
                        if (dedicated.isEmpty()) assertThat(settings.origin.toString()).isEqualTo("https://fallback.example.com");
                        else if (dedicated.contains("dedicated")) assertThat(settings.origin.toString()).isEqualTo("https://dedicated.example.com");
                        else assertThat(settings.origin).isNull();
                    });
        }
    }
}
