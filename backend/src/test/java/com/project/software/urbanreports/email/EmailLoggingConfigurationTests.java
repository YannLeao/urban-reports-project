package com.project.software.urbanreports.email;

import java.nio.file.Files;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Real Boot initialization in a child JVM: no database, secrets, HTTP or application beans. */
class EmailLoggingConfigurationTests {
    static final String LEVEL_ENV="LOGGING_LEVEL_COM_PROJECT_SOFTWARE_URBANREPORTS_EMAIL_OBSERVABILITY";
    @Configuration(proxyBeanMethods=false)
    public static class Probe {
        public static void main(String[] args) {
            try (var context=new SpringApplicationBuilder(Probe.class).web(WebApplicationType.NONE)
                    .run("--spring.config.import=", "--spring.main.banner-mode=off")) {
                var observation=new EmailObservation(EmailObservation.Operation.GENERIC);
                observation.dispatch(); observation.accepted();
                var failure=new EmailObservation(EmailObservation.Operation.GENERIC);
                failure.failed(EmailSendException.Category.CONFIGURATION,EmailObservation.Reason.configuration_missing,0,null);
            }
        }
    }
    String run(String profile,String level,String format) throws Exception {
        var output=Files.createTempFile("email-logging-", ".log");
        try {
            var builder=new ProcessBuilder(System.getProperty("java.home")+"/bin/java","-cp",
                    System.getProperty("surefire.test.class.path"),Probe.class.getName()).redirectErrorStream(true).redirectOutput(output.toFile());
            // Use only the process environment required by the probe. Do not inherit production overrides/secrets.
            builder.environment().clear();
            builder.environment().put("SPRING_PROFILES_ACTIVE",profile);
            if(level!=null) builder.environment().put(LEVEL_ENV,level);
            if(format!=null) builder.environment().put("LOGGING_STRUCTURED_FORMAT_CONSOLE",format);
            var process=builder.start();
            boolean finished=process.waitFor(30,TimeUnit.SECONDS);
            if(!finished) process.destroyForcibly();
            assertThat(finished).isTrue();
            String text=Files.readString(output);
            assertThat(process.exitValue()).withFailMessage(text).isZero();
            return text;
        } finally { Files.deleteIfExists(output); }
    }
    @Test void prodDefaultsToJsonWarnAndEnvironmentEnablesOnlyDedicatedDebug() throws Exception {
        var mapper=JsonMapper.builder().build();
        String normal=run("prod",null,null);
        var lines=normal.lines().filter(line -> line.contains("email.send.")).toList();
        assertThat(lines).hasSize(1);
        var json=mapper.readTree(lines.getFirst());
        assertThat(json.path("level").asString()).isEqualTo("WARN");
        assertThat(json.path("reason").asString()).isEqualTo("configuration_missing");
        String diagnostic=run("prod","DEBUG",null);
        var events=diagnostic.lines().filter(line -> line.contains("email.send.")).map(mapper::readTree).toList();
        assertThat(events).hasSize(3);
        assertThat(events.stream().filter(event -> event.path("level").asString().equals("DEBUG"))).hasSize(2);
        assertThat(diagnostic.lines().filter(line -> line.contains("\"level\":\"DEBUG\"")))
                .allMatch(line -> line.contains(EmailObservation.LOGGER));
        assertThat(normal).contains("Starting", "Started");
    }
    @Test void devTextRendersFieldsAndNativeFormatOverrideWorks() throws Exception {
        String text=run("dev","DEBUG",null);
        assertThat(text).contains("event=\"email.send.completed\"", "send_id=", "reason=\"accepted\"");
        String json=run("dev","DEBUG","logstash");
        assertThat(json.lines().filter(line -> line.contains("email.send.")).map(JsonMapper.builder().build()::readTree)).hasSize(3);
    }
}
