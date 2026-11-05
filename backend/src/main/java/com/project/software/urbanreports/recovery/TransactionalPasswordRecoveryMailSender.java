package com.project.software.urbanreports.recovery;

import com.project.software.urbanreports.email.EmailMessage;
import com.project.software.urbanreports.email.EmailObservation;
import com.project.software.urbanreports.email.TransactionalEmailSender;
import org.springframework.stereotype.Component;

@Component
public class TransactionalPasswordRecoveryMailSender implements PasswordRecoveryMailSender {
    private final TransactionalEmailSender sender;

    public TransactionalPasswordRecoveryMailSender(TransactionalEmailSender sender) { this.sender = sender; }

    @Override public void validateConfiguration() { sender.validateConfiguration(); }

    @Override
    public void send(String recipient, String link, EmailObservation observation) {
        sender.send(new EmailMessage(recipient, "Redefinição de senha — Alô Cidade",
                "Recebemos um pedido para redefinir a senha da sua conta no Alô Cidade.\n"
                + "Use o link abaixo para escolher uma nova senha. Ele vale por 30 minutos e só pode ser usado uma vez.\n\n"
                + link + "\n\nSe você não fez esse pedido, ignore esta mensagem."),
                observation);
    }
}
