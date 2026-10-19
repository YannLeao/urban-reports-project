package com.project.software.urbanreports.email;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.cert.CertificateException;
import java.util.*;
import java.util.concurrent.*;
import javax.net.ssl.SSLHandshakeException;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;
import org.springframework.boot.logging.logback.StructuredLogEncoder;
import org.springframework.core.env.StandardEnvironment;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.project.software.urbanreports.email.EmailObservation.*;
import static com.project.software.urbanreports.email.EmailSendException.Category.*;

class EmailObservabilityTests {
    final BrevoEmailSenderTests fixture = new BrevoEmailSenderTests();
    final Logger logger = (Logger) LoggerFactory.getLogger(LOGGER);
    final ListAppender<ILoggingEvent> events = new ListAppender<>();
    final JsonMapper mapper = JsonMapper.builder().build();
    Level previous;
    @BeforeEach void capture() {
        previous = logger.getLevel(); logger.setLevel(Level.DEBUG);
        events.setContext(logger.getLoggerContext()); events.start(); logger.addAppender(events);
    }
    @AfterEach void cleanup() { logger.detachAppender(events); logger.setLevel(previous); events.stop(); fixture.stop(); }
    List<ILoggingEvent> terminal() { return events.list.stream().filter(e -> fields(e).get("event").equals("email.send.completed")).toList(); }
    Map<String, Object> fields(ILoggingEvent event) {
        Map<String, Object> fields = new HashMap<>();
        event.getKeyValuePairs().forEach(pair -> fields.put(pair.key, pair.value));
        assertThat(event.getThrowableProxy()).isNull();
        return fields;
    }
    String rendered() {
        var context = logger.getLoggerContext();
        context.putObject(org.springframework.core.env.Environment.class.getName(), new StandardEnvironment());
        var encoder = new StructuredLogEncoder(); encoder.setContext(context); encoder.setFormat("logstash"); encoder.start();
        try {
            var output = new StringBuilder();
            for (var event : events.list) {
                String line = new String(encoder.encode(event), StandardCharsets.UTF_8);
                assertThat(line.lines().count()).isEqualTo(1);
                assertThat(mapper.readTree(line).path("send_id").asString()).isNotBlank();
                output.append(line);
            }
            return output.toString();
        } finally { encoder.stop(); }
    }
    Map<String, Object> onlyFailure(String reason, int attempts) {
        assertThat(terminal()).hasSize(1);
        var event = terminal().getFirst(); assertThat(event.getLevel()).isEqualTo(Level.WARN);
        var fields = fields(event);
        assertThat(fields).containsEntry("reason", reason).containsEntry("attempts", attempts);
        assertThat((Long) fields.get("duration_ms")).isNotNegative();
        assertThat(events.list.size()).isLessThanOrEqualTo(2);
        assertThat(rendered()).doesNotContain(BrevoEmailSenderTests.KEY, BrevoEmailSenderTests.LINK, fixture.message.recipient());
        return fields;
    }
    @Test void acceptedIsSilentAtWarnAndCorrelatedAtDebug() throws Exception {
        fixture.serve(201, "{\"messageId\":\"private-provider-id\"}", 0);
        logger.setLevel(Level.WARN); fixture.sender(1000).send(fixture.message); assertThat(events.list).isEmpty();
        logger.setLevel(Level.DEBUG); fixture.sender(1000).send(fixture.message);
        assertThat(events.list).hasSize(2); assertThat(terminal()).hasSize(1);
        assertThat(fields(terminal().getFirst())).containsEntry("outcome", "ACCEPTED").containsEntry("reason", "accepted");
        assertThat(events.list.stream().map(e -> fields(e).get("send_id")).distinct()).hasSize(1);
        assertThat(rendered()).doesNotContain("private-provider-id");
    }
    @ParameterizedTest @ValueSource(ints={301,302,307,308,400,401,403,422,429,500,503})
    void rejectionHasStatusCategoryAndOneTerminal(int status) throws Exception {
        fixture.serve(status, "{\"code\":\"invalid_parameter\",\"message\":\"" + BrevoEmailSenderTests.KEY + "\\r\\nsecret\"}", 0);
        assertThatThrownBy(() -> fixture.sender(1000).send(fixture.message)).isInstanceOf(EmailSendException.class);
        assertThat(onlyFailure("provider_http_rejected",1)).containsEntry("http_status",status)
                .containsEntry("provider_code","invalid_parameter").containsEntry("stage","RESPONSE_VALIDATION")
                .containsEntry("category",status==429 || status>=500 ? "TRANSIENT" : "PERMANENT");
        assertThat(fixture.calls.get()).isEqualTo(1);
    }
    @ParameterizedTest @ValueSource(strings={"{\"code\":\"synthetic-secret-marker\\r\\nspoof\",\"message\":\"synthetic-key-marker\"}", "not-json", "{}"})
    void unknownCodesAreNeverLogged(String body) throws Exception {
        fixture.serve(403,body,0);
        assertThatThrownBy(() -> fixture.sender(1000).send(fixture.message)).isInstanceOf(EmailSendException.class);
        assertThat(onlyFailure("provider_http_rejected",1)).containsEntry("provider_code","unknown_provider_code");
        assertThat(rendered()).doesNotContain("synthetic-secret-marker", "spoof");
    }
    @Test void missingParameterCodeIsAllowedAndNormalFailureIsOneLine() throws Exception {
        logger.setLevel(Level.WARN);
        fixture.serve(400,"{\"code\":\"missing_parameter\"}",0);
        assertThatThrownBy(() -> fixture.sender(1000).send(fixture.message)).isInstanceOf(EmailSendException.class);
        assertThat(events.list).hasSize(1);
        assertThat(onlyFailure("provider_http_rejected",1)).containsEntry("provider_code","missing_parameter");
    }
    @Test void oversizedDiagnosticBodyIsNotParsed() throws Exception {
        fixture.serve(400,"{\"code\":\"invalid_parameter\",\"message\":\"" + "x".repeat(4096) + "\"}",0);
        assertThatThrownBy(() -> fixture.sender(1000).send(fixture.message)).isInstanceOf(EmailSendException.class);
        assertThat(onlyFailure("provider_http_rejected",1)).containsEntry("provider_code","unknown_provider_code");
    }
    @Test void missingConfigurationAndSerializationNeverDispatch() {
        var sender = new BrevoEmailSender(mapper,"","sender@example.com","Name",100,100,BrevoEmailSender.ENDPOINT);
        assertThatThrownBy(() -> sender.send(fixture.message)).isInstanceOf(EmailSendException.class);
        assertThat(onlyFailure("configuration_missing",0)).containsEntry("stage","VALIDATION");
        events.list.clear();
        var invalid = new BrevoEmailSender(mapper,"bad\nkey","sender@example.com","Name",100,100,BrevoEmailSender.ENDPOINT);
        assertThatThrownBy(() -> invalid.send(fixture.message)).isInstanceOf(EmailSendException.class);
        onlyFailure("configuration_invalid",0); events.list.clear();
        var brokenMapper = mock(tools.jackson.databind.ObjectMapper.class);
        when(brokenMapper.writeValueAsString(any())).thenThrow(new IllegalArgumentException("synthetic-secret-marker\r\n"));
        var broken = new BrevoEmailSender(brokenMapper,"fake-key","sender@example.com","Name",100,100,BrevoEmailSender.ENDPOINT);
        assertThatThrownBy(() -> broken.send(fixture.message)).isInstanceOf(EmailSendException.class);
        assertThat(onlyFailure("serialization_failed",0)).containsEntry("stage","SERIALIZATION");
        assertThat(rendered()).doesNotContain("synthetic-secret-marker");
    }
    @ParameterizedTest @ValueSource(strings={"not-json","{}"})
    void invalidAcceptanceRemainsUncertain(String response) throws Exception {
        fixture.serve(201,response,0);
        assertThatThrownBy(() -> fixture.sender(1000).send(fixture.message)).isInstanceOf(EmailSendException.class);
        assertThat(onlyFailure(response.equals("{}") ? "response_missing_message_id" : "response_invalid_json",1))
                .containsEntry("category","UNCERTAIN").containsEntry("http_status",201);
    }
    @Test void deadlineAndRefusedConnectionUseEvidenceOnly() throws Exception {
        fixture.serve(201,"{\"messageId\":\"id\"}",-500);
        assertThatThrownBy(() -> fixture.sender(100).send(fixture.message)).isInstanceOf(EmailSendException.class);
        assertThat(onlyFailure("request_deadline_exceeded",1)).containsEntry("stage","DISPATCH").doesNotContainKey("http_status");
        fixture.stop(); fixture.server=null; events.list.clear();
        try (var socket=new ServerSocket(0)) { fixture.endpoint=URI.create("http://localhost:"+socket.getLocalPort()); }
        assertThatThrownBy(() -> fixture.sender(500).send(fixture.message)).isInstanceOf(EmailSendException.class);
        onlyFailure("connect_failed",1);
    }
    BrevoEmailSender withFuture(CompletableFuture<HttpResponse<String>> future) {
        var client=mock(HttpClient.class);
        when(client.sendAsync(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any())).thenReturn(future);
        return new BrevoEmailSender(mapper,"fake-key","sender@example.com","Name",100,100,BrevoEmailSender.ENDPOINT,client);
    }
    @Test void interruptionPreservesFlagAndCancelsFuture() {
        var future=new CompletableFuture<HttpResponse<String>>(); var sender=withFuture(future);
        Thread.currentThread().interrupt();
        try { assertThatThrownBy(() -> sender.send(fixture.message)).isInstanceOf(EmailSendException.class);
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            assertThat(future.isCancelled()).isTrue(); onlyFailure("interrupted",1);
        } finally { Thread.interrupted(); }
    }
    @Test void cancellationKeepsExistingConfigurationCategory() {
        var future=new CompletableFuture<HttpResponse<String>>(); future.cancel(true);
        assertThatThrownBy(() -> withFuture(future).send(fixture.message)).isInstanceOfSatisfying(EmailSendException.class,e -> assertThat(e.category()).isEqualTo(CONFIGURATION));
        onlyFailure("cancelled",1);
    }
    @Test void wrappedTlsAndDnsAreSanitizedWithoutReclassifying() {
        var tls=new SSLHandshakeException("synthetic-secret-marker\r\n"); tls.initCause(new CertificateException("synthetic-key-marker"));
        var wrapper=new RuntimeException(new CompletionException(tls)); wrapper.addSuppressed(new RuntimeException(BrevoEmailSenderTests.LINK));
        assertThatThrownBy(() -> withFuture(CompletableFuture.failedFuture(wrapper)).send(fixture.message)).isInstanceOf(EmailSendException.class);
        assertThat(onlyFailure("tls_certificate_validation_failed",1)).containsEntry("category","UNCERTAIN");
        assertThat(rendered()).doesNotContain("synthetic-secret-marker");
        events.list.clear();
        assertThatThrownBy(() -> withFuture(CompletableFuture.failedFuture(new UnknownHostException("synthetic-secret-marker"))).send(fixture.message)).isInstanceOf(EmailSendException.class);
        onlyFailure("dns_resolution_failed",1);
    }
    @Test void causeMappingIsBoundedAndCycleSafe() {
        assertThat(reason(null)).isEqualTo(Reason.unknown_failure);
        Throwable cycle=new RuntimeException(); var other=new RuntimeException(cycle); cycle.initCause(other);
        assertThat(reason(cycle)).isEqualTo(Reason.unknown_failure);
        Throwable longChain=new UnknownHostException(); for(int i=0;i<32;i++) longChain=new RuntimeException(longChain);
        assertThat(reason(longChain)).isEqualTo(Reason.unknown_failure);
        assertThat(reason(new ExecutionException(new CompletionException(new UnknownHostException())))).isEqualTo(Reason.dns_resolution_failed);
        assertThat(reason(new HttpConnectTimeoutException("secret"))).isEqualTo(Reason.connect_timeout);
        assertThat(reason(new SSLHandshakeException("secret"))).isEqualTo(Reason.tls_handshake_failed);
        assertThat(reason(new EOFException("secret"))).isEqualTo(Reason.connection_closed);
        assertThat(reason(new IOException("secret"))).isEqualTo(Reason.io_failure);
        assertThat(reason(new IllegalStateException("secret"))).isEqualTo(Reason.unknown_failure);
    }
    @Test void concurrentCallsKeepIdsLocalAndTerminalIsIdempotent() throws Exception {
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(201);
        when(response.body()).thenReturn("{\"messageId\":\"private-provider-id\"}");
        var sender = withFuture(CompletableFuture.completedFuture(response));
        try(var pool=Executors.newFixedThreadPool(4)) {
            var jobs=new ArrayList<Callable<Void>>();
            for(int i=0;i<12;i++) jobs.add(() -> {
                var observation=new EmailObservation(Operation.ADMIN_RESEND);
                sender.send(fixture.message, observation);
                observation.accepted(); // service fallback must not duplicate the transport terminal
                return null;
            });
            for(var future:pool.invokeAll(jobs)) future.get();
        }
        assertThat(events.list).hasSize(24); assertThat(terminal()).hasSize(12);
        var groups=events.list.stream().collect(java.util.stream.Collectors.groupingBy(e -> fields(e).get("send_id")));
        assertThat(groups).hasSize(12); groups.values().forEach(group -> assertThat(group).hasSize(2));
        assertThat(org.slf4j.MDC.getCopyOfContextMap()).isNullOrEmpty();
        assertThat(rendered()).doesNotContain("private-provider-id", BrevoEmailSenderTests.KEY, BrevoEmailSenderTests.LINK, fixture.message.recipient());
    }
    @Test void appenderFailureDoesNotReplaceAcceptance() throws Exception {
        var broken=new ch.qos.logback.core.AppenderBase<ILoggingEvent>() {
            @Override public void doAppend(ILoggingEvent event) { throw new IllegalStateException("diagnostic failure"); }
            @Override protected void append(ILoggingEvent event) {}
        };
        broken.setContext(logger.getLoggerContext()); broken.start(); logger.addAppender(broken);
        try { fixture.serve(201,"{\"messageId\":\"id\"}",0); assertThat(fixture.sender(1000).send(fixture.message).messageId()).isEqualTo("id"); }
        finally { logger.detachAppender(broken); broken.stop(); }
    }
}
