package com.project.software.urbanreports.administration;

public interface ActivationMailSender {
    /** Provider acceptance only; never a guarantee of recipient delivery. */
    void send(String recipient, String activationLink);
}
