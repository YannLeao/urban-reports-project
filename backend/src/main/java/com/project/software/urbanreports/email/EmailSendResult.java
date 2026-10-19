package com.project.software.urbanreports.email;

/** Provider acceptance only; not proof of delivery. */
public record EmailSendResult(String messageId) {
    public EmailSendResult {
        if (messageId == null || messageId.isBlank()) throw new IllegalArgumentException("Missing email acceptance ID");
    }
    @Override public String toString() { return "EmailSendResult[accepted]"; }
}
