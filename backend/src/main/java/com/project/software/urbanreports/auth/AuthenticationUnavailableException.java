package com.project.software.urbanreports.auth;

import org.springframework.security.core.AuthenticationException;

/** A fail-closed, retryable outage rather than an invalid credential. */
public final class AuthenticationUnavailableException extends AuthenticationException {
    public AuthenticationUnavailableException() { super("Authentication unavailable"); }
}
