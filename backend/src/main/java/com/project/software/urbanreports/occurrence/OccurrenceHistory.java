package com.project.software.urbanreports.occurrence;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.Immutable;

@Entity
@Immutable
@Table(name = "occurrence_history")
public class OccurrenceHistory {
    @Id private UUID id;
    @Column(name = "occurrence_id", nullable = false) private UUID occurrenceId;
    @Enumerated(EnumType.STRING)
    @Column(name = "previous_status", nullable = false, length = 32) private OccurrenceStatus previousStatus;
    @Enumerated(EnumType.STRING)
    @Column(name = "new_status", nullable = false, length = 32) private OccurrenceStatus newStatus;
    @Column(name = "moderator_id", nullable = false) private UUID moderatorId;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(length = 500) private String reason;
    @Column(nullable = false) private long version;

    protected OccurrenceHistory() {}

    public AuthorEvent authorEvent() {
        return new AuthorEvent(id, previousStatus, newStatus, occurredAt, reason, "Moderação");
    }

    public record AuthorEvent(UUID id, OccurrenceStatus previousStatus, OccurrenceStatus newStatus,
            Instant occurredAt, String reason, String responsible) {}
}
