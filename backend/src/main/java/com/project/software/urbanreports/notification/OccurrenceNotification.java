package com.project.software.urbanreports.notification;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "occurrence_notifications")
public class OccurrenceNotification {
    @Id private UUID id;
    @Column(name = "event_id", nullable = false, unique = true) private UUID eventId;
    @Column(name = "occurrence_id", nullable = false) private UUID occurrenceId;
    @Column(name = "recipient_id", nullable = false) private UUID recipientId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32) private NotificationType type;
    @Column(nullable = false, length = 700) private String message;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "read_at") private Instant readAt;

    protected OccurrenceNotification() {}

    public UUID getId() { return id; }
    public UUID getOccurrenceId() { return occurrenceId; }
    public NotificationType getType() { return type; }
    public String getMessage() { return message; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getReadAt() { return readAt; }
    public void markRead(Instant instant) { readAt = instant; }
}
