package com.project.software.urbanreports.email;

public interface TransactionalEmailSender {
    /** Local preflight only. Must never perform network I/O. */
    default void validateConfiguration() {}
    EmailSendResult send(EmailMessage message);
    default EmailSendResult send(EmailMessage message, EmailObservation observation) { return send(message); }
}
