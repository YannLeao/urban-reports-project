package com.project.software.urbanreports.storage.infrastructure;

import com.project.software.urbanreports.storage.application.UploadJournal;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "image.recovery.enabled", havingValue = "true", matchIfMissing = true)
public class UploadRecoverySchedule {
    private final UploadJournal journal;
    public UploadRecoverySchedule(UploadJournal journal) { this.journal = journal; }
    @Bean
    ThreadPoolTaskScheduler uploadRecoveryScheduler() {
        var scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("upload-recovery-");
        return scheduler;
    }
    @Scheduled(scheduler = "uploadRecoveryScheduler", fixedDelayString = "${image.recovery.interval:60000}", initialDelayString = "${image.recovery.interval:60000}")
    public void recover() { journal.recover(); }
}
