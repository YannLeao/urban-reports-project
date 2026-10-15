package com.project.software.urbanreports.identity;

import com.project.software.urbanreports.administration.SmtpActivationMailSender;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import static org.assertj.core.api.Assertions.*;

class SmtpInvitationTests {
    @Test void productionAdapterSendsThroughSmtpAndDoesNotClaimRecipientDelivery() throws Exception {
        try (var server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress()); var executor = Executors.newSingleThreadExecutor()) {
            server.setSoTimeout(10000);
            var received = executor.submit(() -> {
                try (var socket = server.accept()) {
                    socket.setSoTimeout(10000);
                    var reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                    var writer = new PrintWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8), true);
                    writer.print("220 test SMTP\r\n"); writer.flush();
                    StringBuilder message = new StringBuilder();
                    boolean data = false;
                    for (String line; (line = reader.readLine()) != null;) {
                        if (data && !line.equals(".")) { message.append(line).append('\n'); continue; }
                        if (data) { data = false; writer.print("250 accepted\r\n"); }
                        else if (line.startsWith("DATA")) { data = true; writer.print("354 data\r\n"); }
                        else if (line.startsWith("QUIT")) { writer.print("221 bye\r\n"); writer.flush(); break; }
                        else writer.print("250 ok\r\n");
                        writer.flush();
                    }
                    return message.toString();
                }
            });
            var transport = new JavaMailSenderImpl(); transport.setHost(server.getInetAddress().getHostAddress()); transport.setPort(server.getLocalPort());
            var factory = new StaticListableBeanFactory(); factory.addBean("smtp", transport);
            var sender = new SmtpActivationMailSender(factory.getBeanProvider(JavaMailSender.class), "invites@example.com");
            sender.send("admin@example.com", "https://example.com/ativar-administrador#token=synthetic-test-token");
            String message = received.get(10, TimeUnit.SECONDS);
            assertThat(message.contains("admin@example.com")).isTrue();
            assertThat(message.contains("ativar-administrador")).isTrue();
        }
    }
}
