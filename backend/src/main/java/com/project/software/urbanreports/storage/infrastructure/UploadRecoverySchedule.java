package com.project.software.urbanreports.storage.infrastructure;

import com.project.software.urbanreports.storage.application.UploadJournal;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "image.recovery.enabled", havingValue = "true", matchIfMissing = true)
public class UploadRecoverySchedule {
    private final UploadJournal journal;
    public UploadRecoverySchedule(UploadJournal journal) { this.journal = journal; }
    @Scheduled(fixedDelayString = "${image.recovery.interval:60000}", initialDelayString = "${image.recovery.interval:60000}")
    public void recover() { journal.recover(); }
}
