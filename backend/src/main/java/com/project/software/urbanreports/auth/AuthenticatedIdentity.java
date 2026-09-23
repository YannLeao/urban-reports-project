package com.project.software.urbanreports.auth;

import java.util.UUID;
import com.project.software.urbanreports.identity.RegistrationResponse;

public record AuthenticatedIdentity(UUID userId, UUID sessionId, RegistrationResponse user) {}
