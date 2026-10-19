package com.project.software.urbanreports.administration;

import com.project.software.urbanreports.email.EmailMessage;
import com.project.software.urbanreports.email.EmailObservation;
import com.project.software.urbanreports.email.TransactionalEmailSender;
import org.springframework.stereotype.Component;

@Component
public class TransactionalActivationMailSender implements ActivationMailSender {
    private final TransactionalEmailSender sender;
    public TransactionalActivationMailSender(TransactionalEmailSender sender) { this.sender = sender; }
    @Override public void send(String recipient, String link) {
        send(recipient, link, new EmailObservation(EmailObservation.Operation.ADMIN_INVITATION));
    }
    @Override public void send(String recipient, String link, EmailObservation observation) {
        sender.send(new EmailMessage(recipient, "Ative sua conta administrativa — Alô Cidade",
                "Você recebeu um convite para moderar relatos no Alô Cidade.\nDefina sua senha pelo link abaixo, válido por 24 horas.\n\n"
                + link + "\n\nSe não esperava este convite, ignore esta mensagem."), observation);
    }
}
