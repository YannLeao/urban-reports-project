package com.project.software.urbanreports.email;

public record EmailMessage(String recipient, String subject, String text) {
    @Override public String toString() { return "EmailMessage[redacted]"; }
}
