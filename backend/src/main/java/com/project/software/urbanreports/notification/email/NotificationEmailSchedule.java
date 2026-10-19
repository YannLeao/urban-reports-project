package com.project.software.urbanreports.notification.email;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "notifications.email.enabled", havingValue = "true")
public class NotificationEmailSchedule {
    private final NotificationEmailWorker worker;
    public NotificationEmailSchedule(NotificationEmailWorker worker) { this.worker = worker; }

    @Bean
    ThreadPoolTaskScheduler notificationEmailScheduler(NotificationEmailDiagnostics diagnostics) {
        var scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("notification-email-");
        scheduler.setErrorHandler(failure -> diagnostics.warn(NotificationEmailDiagnostics.Condition.SCHEDULER, null));
        return scheduler;
    }

    @Scheduled(scheduler = "notificationEmailScheduler", fixedDelayString = "#{@notificationEmailSettings.intervalMs()}",
            initialDelayString = "#{@notificationEmailSettings.intervalMs()}")
    public void consume() { worker.poll(); }
}
