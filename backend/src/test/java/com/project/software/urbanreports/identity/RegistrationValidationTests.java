package com.project.software.urbanreports.identity;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class RegistrationValidationTests {
    @Test void emailContractAndNameBoundaries() {
        for (String email : new String[]{"pessoa@example.com", " USER+tag@EXAMPLE.COM ", "a.b@example.co.uk", "o'hara@example.com"}) {
            assertThatCode(() -> RegistrationValidation.validate(new RegistrationRequest("Ána D'Ávila", email, "a".repeat(15)))).doesNotThrowAnyException();
        }
        for (String email : new String[]{"a..b@example.com", ".a@example.com", "a@localhost", "á@example.com", "a@-example.com", "a@exa_mple.com", "a@ｅxample.com", "a".repeat(65) + "@example.com"}) {
            assertThatThrownBy(() -> RegistrationValidation.validate(new RegistrationRequest("Pessoa", email, "a".repeat(15))))
                    .isInstanceOf(RegistrationValidationException.class);
        }
        for (String name : new String[]{" ", "a", "a".repeat(101), "Ana\nSilva", "Ana\u007f", "Ana\u2028Silva"}) {
            assertThatThrownBy(() -> RegistrationValidation.validate(new RegistrationRequest(name, "a@example.com", "a".repeat(15))))
                    .isInstanceOf(RegistrationValidationException.class);
        }
        for (String name : new String[]{"Áa", "𐐀".repeat(100)}) {
            assertThatCode(() -> RegistrationValidation.validate(new RegistrationRequest(name, "a@example.com", "a".repeat(128)))).doesNotThrowAnyException();
        }
    }

    @Test void emailLengthBoundaries() {
        String maximum = "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(61);
        assertThat(maximum.length()).isEqualTo(254);
        assertThatCode(() -> RegistrationValidation.validate(new RegistrationRequest("Pessoa", maximum, "a".repeat(15))))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> RegistrationValidation.validate(new RegistrationRequest("Pessoa", maximum + "d", "a".repeat(15))))
                .isInstanceOf(RegistrationValidationException.class);
    }

    @Test void unexpectedFailureRemainsGeneric() {
        var request = new org.springframework.mock.web.MockHttpServletRequest("POST", "/api/auth/register");
        var response = new RegistrationExceptionHandler().handle(new IllegalStateException("private detail"), request);
        assertThat(response.getStatusCode().value()).isEqualTo(500);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getBody().code()).isEqualTo("INTERNAL_ERROR");
        assertThat(response.getBody().message()).doesNotContain("private detail");
    }

    @Test void onlyNamedUniqueConstraintMapsToConflict() {
        var sql = new java.sql.SQLException("not inspected", "23505");
        assertThat(RegistrationExceptionHandler.isDuplicateEmail(new org.hibernate.exception.ConstraintViolationException("failure", sql, "uk_user_accounts_email"))).isTrue();
        assertThat(RegistrationExceptionHandler.isDuplicateEmail(new org.hibernate.exception.ConstraintViolationException("failure", sql, "other_constraint"))).isFalse();
        assertThat(RegistrationExceptionHandler.isDuplicateEmail(new IllegalStateException("uk_user_accounts_email"))).isFalse();
    }
}
