package com.project.software.urbanreports;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class UrbanReportsApplication {

    public static void main(String[] args) {
        SpringApplication.run(UrbanReportsApplication.class, args);
    }
}

