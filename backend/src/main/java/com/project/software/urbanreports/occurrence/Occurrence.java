package com.project.software.urbanreports.occurrence;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "occurrences")
public class Occurrence {
    @Id private UUID id;
    @Column(name = "author_id", nullable = false) private UUID authorId;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private OccurrenceCategory category;
    @Column(nullable = false, length = 100) private String title;
    @Column(nullable = false, length = 1000) private String description;
    @Column(nullable = false, length = 100) private String neighborhood;
    @Column(name = "reference", nullable = false, length = 200) private String locationReference;
    @Column(name = "image_key", nullable = false, unique = true, length = 255) private String imageKey;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32) private OccurrenceStatus status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected Occurrence() {}

    public Occurrence(UUID authorId, OccurrenceCategory category, String title, String description,
            String neighborhood, String locationReference, String imageKey, Instant createdAt) {
        this.id = UUID.randomUUID();
        this.authorId = authorId;
        this.category = category;
        this.title = title;
        this.description = description;
        this.neighborhood = neighborhood;
        this.locationReference = locationReference;
        this.imageKey = imageKey;
        this.status = OccurrenceStatus.PENDING;
        this.createdAt = createdAt;
    }

    public UUID getId() { return id; }
    public UUID getAuthorId() { return authorId; }
    public OccurrenceCategory getCategory() { return category; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public String getNeighborhood() { return neighborhood; }
    public String getLocationReference() { return locationReference; }
    public String getImageKey() { return imageKey; }
    public OccurrenceStatus getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
}
