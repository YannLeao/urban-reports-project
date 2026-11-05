package com.project.software.urbanreports.recovery;

import java.util.concurrent.ThreadPoolExecutor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration(proxyBeanMethods = false)
public class RecoveryConfiguration {
    @Bean
    ThreadPoolTaskExecutor passwordRecoveryExecutor(RecoverySettings settings) {
        var executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("password-recovery-");
        executor.setCorePoolSize(settings.workers);
        executor.setMaxPoolSize(settings.workers);
        executor.setQueueCapacity(settings.queue);
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        executor.setAcceptTasksAfterContextClose(true);
        executor.setWaitForTasksToCompleteOnShutdown(true);
        // RecoveryDelivery drains with this deadline and cancels work that never started.
        executor.setAwaitTerminationSeconds(settings.shutdownSeconds);
        return executor;
    }
}
