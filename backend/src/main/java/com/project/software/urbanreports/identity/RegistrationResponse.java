package com.project.software.urbanreports.identity;

import java.util.UUID;

public record RegistrationResponse(UUID id, String name, String email, AccountRole role) {}
