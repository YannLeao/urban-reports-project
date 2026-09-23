package com.project.software.urbanreports.security;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class PasswordEncoderTests {
    @Test
    void argon2idPreservesPasswordAndUsesIndependentSalts() {
        var encoder = new SecurityConfiguration().passwordEncoder();
        String password = "  Synthetic senha á with spaces  ";
        String first = encoder.encode(password);
        String second = encoder.encode(password);
        assertThat(first).startsWith("$argon2id$v=19$m=19456,t=2,p=1$");
        assertThat(second).isNotEqualTo(first);
        assertThat(encoder.matches(password, first)).isTrue();
        assertThat(encoder.matches(password, second)).isTrue();
        assertThat(encoder.matches("incorrect", first)).isFalse();
        assertThat(encoder.matches(password.trim(), first)).isFalse();
        var parts = first.split("\\$");
        assertThat(java.util.Base64.getDecoder().decode(parts[4])).hasSize(16);
        assertThat(java.util.Base64.getDecoder().decode(parts[5])).hasSize(32);
    }
}
