package com.project.software.urbanreports.email;

public interface TransactionalEmailSender {
    EmailSendResult send(EmailMessage message);
    default EmailSendResult send(EmailMessage message, EmailObservation observation) { return send(message); }
}
