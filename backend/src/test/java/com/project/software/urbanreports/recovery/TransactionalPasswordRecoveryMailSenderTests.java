package com.project.software.urbanreports.recovery;

import com.project.software.urbanreports.email.EmailMessage;
import com.project.software.urbanreports.email.EmailObservation;
import com.project.software.urbanreports.email.TransactionalEmailSender;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class TransactionalPasswordRecoveryMailSenderTests {
    static final String LINK = "https://example.com/redefinir-senha#token=synthetic-test-token";

    @Test void sendsTheLinkWithTheThirtyMinuteNotice() {
        var provider = mock(TransactionalEmailSender.class);
        new TransactionalPasswordRecoveryMailSender(provider).send("user@example.com", LINK, new EmailObservation(EmailObservation.Operation.PASSWORD_RECOVERY));
        var captor = ArgumentCaptor.forClass(EmailMessage.class);
        verify(provider).send(captor.capture(), any(EmailObservation.class));
        var message = captor.getValue();
        assertThat(message.recipient()).isEqualTo("user@example.com");
        assertThat(message.subject()).isNotBlank();
        assertThat(message.text()).contains(LINK).contains("30 minutos");
    }

    @Test void providerFailureIsNotSwallowedByTheSender() {
        var provider = mock(TransactionalEmailSender.class);
        when(provider.send(any(EmailMessage.class), any(EmailObservation.class))).thenThrow(new IllegalStateException("provider down"));
        assertThatThrownBy(() -> new TransactionalPasswordRecoveryMailSender(provider).send("user@example.com", LINK, new EmailObservation(EmailObservation.Operation.PASSWORD_RECOVERY)))
                .isInstanceOf(IllegalStateException.class);
    }
}