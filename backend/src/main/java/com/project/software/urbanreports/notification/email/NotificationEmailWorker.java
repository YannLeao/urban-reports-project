package com.project.software.urbanreports.notification.email;

import com.project.software.urbanreports.email.*;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static com.project.software.urbanreports.notification.email.NotificationEmailStore.*;
import static com.project.software.urbanreports.notification.email.NotificationEmailDiagnostics.Condition.*;

@Component
public final class NotificationEmailWorker {
    private final NotificationEmailStore store;
    private final TransactionalEmailSender sender;
    private final NotificationEmailSettings settings;
    private final NotificationEmailDiagnostics diagnostics;
    private final Clock clock;
    private final AtomicBoolean running = new AtomicBoolean();
    private volatile boolean stopping;

    public NotificationEmailWorker(NotificationEmailStore store, TransactionalEmailSender sender,
            NotificationEmailSettings settings, NotificationEmailDiagnostics diagnostics, Clock clock) {
        this.store = store; this.sender = sender; this.settings = settings; this.diagnostics = diagnostics; this.clock = clock;
    }

    @PreDestroy public void stop() { stopping = true; }

    public void poll() {
        if (!settings.enabled || stopping || Thread.currentThread().isInterrupted() || !running.compareAndSet(false, true)) return;
        try {
            if (TransactionSynchronizationManager.isActualTransactionActive())
                throw new IllegalStateException("Notification consumer requires no ambient transaction");
            if (store.expire(clock.instant(), settings.batchSize) > 0) diagnostics.warn(LEASE_EXPIRED, null);
            try { settings.validatedOrigin(); sender.validateConfiguration(); }
            catch (RuntimeException invalid) { diagnostics.warn(CONFIGURATION, null); return; }
            for (int i = 0; i < settings.batchSize && !stopping && !Thread.currentThread().isInterrupted(); i++) {
                var reserved = store.reserve(clock.instant(), settings.leaseMs, java.util.UUID.randomUUID());
                if (reserved.isEmpty()) break;
                var observation = new EmailObservation(EmailObservation.Operation.OCCURRENCE_NOTIFICATION, reserved.orElseThrow().sendId());
                if (!process(reserved.orElseThrow(), observation)) break;
            }
        } catch (RuntimeException failure) { diagnostics.warn(DATABASE, null); }
        finally { running.set(false); }
    }

    private boolean process(Claim claim, EmailObservation observation) {
        // Logical send context starts after the reservation commit, before preparation.
        State state;
        Diagnostic diagnostic;
        EmailSendException.Category category = null;
        int httpStatus = 0;
        var recipient = store.recipient(claim, clock.instant());
        if (recipient.isEmpty()) { diagnostics.warn(OWNERSHIP_LOST, claim.sendId()); return true; }
        if (!recipient.orElseThrow().eligible()) {
            state = State.SUPPRESSED; diagnostic = Diagnostic.INELIGIBLE_RECIPIENT;
        } else {
            boolean prepared = false;
            try {
                if (stopping || Thread.currentThread().isInterrupted()) return false; // reservation remains honest
                String link = settings.validatedOrigin() + "/meus-relatos/" + recipient.orElseThrow().occurrenceId();
                var message = new EmailMessage(recipient.orElseThrow().email(), "Atualização do seu relato — Alô Cidade",
                        "Há uma atualização no seu relato. Entre no Alô Cidade para consultar os detalhes.\n\n" + link + "\n\nAlô Cidade");
                prepared = true;
                java.util.Objects.requireNonNull(sender.send(message, observation));
                observation.accepted();
                state = State.ACCEPTED; diagnostic = Diagnostic.ACCEPTED;
            } catch (EmailSendException failure) {
                category = failure.category(); httpStatus = failure.status();
                state = category == EmailSendException.Category.UNCERTAIN ? State.UNCERTAIN : State.FAILED;
                diagnostic = Diagnostic.TRANSPORT_FAILURE;
                observation.failed(category, EmailObservation.Reason.unknown_failure, httpStatus, null);
            } catch (RuntimeException failure) {
                category = prepared ? EmailSendException.Category.UNCERTAIN : EmailSendException.Category.CONFIGURATION;
                state = prepared ? State.UNCERTAIN : State.FAILED;
                diagnostic = Diagnostic.UNEXPECTED_FAILURE;
                observation.failed(category, prepared ? EmailObservation.Reason.unknown_failure
                        : EmailObservation.Reason.notification_link_preparation_failed, 0, null);
            }
        }
        try {
            if (!store.complete(claim, state, diagnostic, category, httpStatus, clock.instant()))
                diagnostics.warn(OWNERSHIP_LOST, claim.sendId());
        } catch (RuntimeException failure) {
            diagnostics.warn(RESULT_NOT_SAVED, claim.sendId());
            return false; // no new reservations on persistence failure, no second POST
        }
        return true;
    }
}
