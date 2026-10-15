package com.project.software.urbanreports.administration;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
public class SmtpActivationMailSender implements ActivationMailSender {
    private final ObjectProvider<JavaMailSender> sender;
    private final String from;
    public SmtpActivationMailSender(ObjectProvider<JavaMailSender> sender, @Value("${admin.mail.from:}") String from) {
        this.sender = sender; this.from = from;
    }
    public void send(String recipient, String link) {
        var mailer = sender.getIfAvailable();
        if (mailer == null || from.isBlank()) throw new IllegalStateException("Invitation mail unavailable");
        var message = new SimpleMailMessage();
        message.setFrom(from); message.setTo(recipient); message.setSubject("Ative sua conta administrativa — Alô Cidade");
        message.setText("Você recebeu um convite para moderar relatos no Alô Cidade.\nDefina sua senha pelo link abaixo, válido por 24 horas.\n\n" + link
                + "\n\nSe não esperava este convite, ignore esta mensagem.");
        mailer.send(message);
    }
}
