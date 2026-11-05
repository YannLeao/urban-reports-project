package com.project.software.urbanreports.recovery;

import com.project.software.urbanreports.email.*;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.DependsOn;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;
import static com.project.software.urbanreports.email.EmailObservation.Reason.*;
import static com.project.software.urbanreports.email.EmailObservation.Stage.*;

/** A reservation covers transaction preparation, queueing and execution, without waiting for a slot. */
@Component
@DependsOn("entityManagerFactory")
public final class RecoveryDelivery {
    private final ThreadPoolTaskExecutor executor;
    private final Semaphore capacity;
    private final RecoverySettings settings;
    private final RecoveryDiagnostics diagnostics;
    private boolean accepting = true;

    public RecoveryDelivery(RecoverySettings settings, RecoveryDiagnostics diagnostics,
            @Qualifier("passwordRecoveryExecutor") ThreadPoolTaskExecutor executor) {
        this.settings = settings; this.diagnostics = diagnostics;
        capacity = new Semaphore(settings.workers + settings.queue);
        this.executor = executor;
    }

    public synchronized Reservation reserve() {
        if (accepting && capacity.tryAcquire()) return new Reservation();
        if (accepting) diagnostics.failure(new EmailObservation(EmailObservation.Operation.PASSWORD_RECOVERY),
                ADMISSION, EmailSendException.Category.TRANSIENT, recovery_capacity_exhausted);
        return null;
    }

    public synchronized void submit(Reservation reservation, EmailObservation observation, Runnable work) {
        try {
            if (!accepting) throw new RejectedExecutionException();
            executor.execute(new Work(reservation, observation, work));
        }
        catch (RuntimeException rejected) {
            reservation.close();
            diagnostics.failure(observation, SUBMISSION, EmailSendException.Category.TRANSIENT, recovery_submission_rejected);
        }
    }

    public final class Reservation implements AutoCloseable {
        private final AtomicBoolean released = new AtomicBoolean();
        @Override public void close() { if (released.compareAndSet(false, true)) capacity.release(); }
    }

    private final class Work implements Runnable {
        private final Reservation reservation;
        private final EmailObservation observation;
        private final Runnable work;
        Work(Reservation reservation, EmailObservation observation, Runnable work) {
            this.reservation = reservation; this.observation = observation; this.work = work;
        }
        @Override public void run() {
            try {
                observation.stage(EXECUTION);
                work.run();
            } catch (RuntimeException failure) {
                diagnostics.failure(observation, EXECUTION, EmailSendException.Category.UNCERTAIN, recovery_task_failed);
            } finally { reservation.close(); }
        }
        void cancel() {
            reservation.close();
            diagnostics.failure(observation, EXECUTION, EmailSendException.Category.UNCERTAIN, recovery_shutdown);
        }
        @Override public String toString() { return "RecoveryWork[redacted]"; }
    }

    @EventListener(ContextClosedEvent.class)
    public synchronized void stopAdmission() { accepting = false; }

    @PreDestroy
    public void shutdown() {
        stopAdmission();
        var pool = executor.getThreadPoolExecutor();
        pool.shutdown();
        try {
            if (pool.awaitTermination(settings.shutdownSeconds, TimeUnit.SECONDS)) return;
        } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        for (var task : pool.shutdownNow()) if (task instanceof Work work) work.cancel();
        executor.setAwaitTerminationSeconds(0); // The bean destroy callback must not add another grace period.
    }
}
