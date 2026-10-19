package com.project.software.urbanreports.email;

public interface TransactionalEmailSender {
    EmailSendResult send(EmailMessage message);
}
