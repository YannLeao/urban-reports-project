package com.project.software.urbanreports.recovery;

import com.project.software.urbanreports.email.EmailObservation;

public interface PasswordRecoveryMailSender {
    void validateConfiguration();
    /** Provider acceptance only; never a guarantee of recipient delivery. */
    void send(String recipient, String resetLink, EmailObservation observation);
}
