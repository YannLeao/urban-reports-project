package com.project.software.urbanreports.email;

/** Deliberately excludes provider bodies and exception causes, which can contain secrets. */
public final class EmailSendException extends RuntimeException {
    public enum Category { CONFIGURATION, PERMANENT, TRANSIENT, UNCERTAIN }
    private final Category category;
    private final int status;
    public EmailSendException(Category category, int status) {
        super("Email send failed: " + category + " (status=" + status + ")");
        this.category = category;
        this.status = status;
    }
    public Category category() { return category; }
    public int status() { return status; }
}
