package com.project.software.urbanreports.notification;

import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import com.project.software.urbanreports.administration.AccountAccess;
import com.project.software.urbanreports.identity.AccountRole;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class NotificationService {
    private final OccurrenceNotificationRepository notifications;
    private final Clock clock;
    private final AccountAccess access;

    public NotificationService(OccurrenceNotificationRepository notifications, Clock clock, AccountAccess access) {
        this.notifications = notifications;
        this.clock = clock;
        this.access = access;
    }

    @Transactional(readOnly = true)
    public PageResponse list(AuthenticatedIdentity identity, int page, int size) {
        access.check(identity, AccountRole.USER);
        if (page < 0 || size < 1 || size > 100)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid pagination");
        var result = notifications.findByRecipientId(identity.userId(),
                PageRequest.of(page, size, Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"))));
        return new PageResponse(result.getContent().stream().map(NotificationResponse::from).toList(),
                page, size, result.getTotalElements(), result.getTotalPages(), notifications.countByRecipientIdAndReadAtIsNull(identity.userId()));
    }

    @Transactional
    public NotificationResponse markRead(AuthenticatedIdentity identity, UUID id) {
        access.lock(identity, AccountRole.USER);
        var notification = notifications.lockOwned(id, identity.userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found"));
        if (notification.getReadAt() == null) notification.markRead(clock.instant());
        return NotificationResponse.from(notification);
    }

    public record PageResponse(List<NotificationResponse> items, int page, int size,
            long totalItems, int totalPages, long unreadCount) {}

    public record NotificationResponse(UUID id, UUID occurrenceId, NotificationType type,
            String message, Instant createdAt, Instant readAt) {
        static NotificationResponse from(OccurrenceNotification notification) {
            return new NotificationResponse(notification.getId(), notification.getOccurrenceId(),
                    notification.getType(), notification.getMessage(),
                    notification.getCreatedAt(), notification.getReadAt());
        }
    }
}
