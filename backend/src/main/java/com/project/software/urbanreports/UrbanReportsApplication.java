package com.project.software.urbanreports;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class UrbanReportsApplication {

    public static void main(String[] args) {
        var application = new SpringApplication(UrbanReportsApplication.class);
        if (java.util.Arrays.asList(args).contains("--admin.bootstrap=true")) {
            application.setWebApplicationType(org.springframework.boot.WebApplicationType.NONE);
            var bootstrapArgs = java.util.Arrays.copyOf(args, args.length + 2);
            bootstrapArgs[args.length] = "--spring.main.web-application-type=none";
            bootstrapArgs[args.length + 1] = "--image.recovery.enabled=false";
            try (var context = application.run(bootstrapArgs)) { /* Explicit one-shot operator command. */ }
        } else application.run(args);
    }
}

