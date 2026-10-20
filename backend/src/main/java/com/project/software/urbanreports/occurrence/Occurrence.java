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
    @Column(length = 1000) private String description;
    @Column(nullable = false, length = 100) private String neighborhood;
    @Column(name = "reference", nullable = false, length = 200) private String locationReference;
    @Column private Double latitude;
    @Column private Double longitude;
    @OneToMany(mappedBy = "occurrence", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC, id ASC")
    @org.hibernate.annotations.BatchSize(size = 50)
    private java.util.List<OccurrenceMedia> media = new java.util.ArrayList<>();
    public java.util.List<OccurrenceMedia> getMedia() { return java.util.Collections.unmodifiableList(media); }
    public java.util.List<OccurrenceMedia.Response> mediaResponse(String base) {
        return media.stream().map(item -> item.response(base + id)).toList();
    }
    void replaceMedia(java.util.List<OccurrenceMedia> items) {
        if (items.isEmpty() || items.size() > 5 || items.stream().anyMatch(item -> item.kind().equals("VIDEO")) && items.size() != 1) throw new IllegalArgumentException("Invalid media count");
        media.removeIf(item -> !items.contains(item));
        for (int i = 0; i < items.size(); i++) {
            var item = items.get(i); item.position(i);
            if (!media.contains(item)) media.add(item);
        }
        media.sort(java.util.Comparator.comparingInt(item -> items.indexOf(item)));
    }
    String mediaKey(UUID mediaId) {
        return media.stream().filter(item -> item.getId().equals(mediaId)).findFirst()
                .orElseThrow(() -> new OccurrenceNotFoundException(id)).getObjectKey();
    }
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32) private OccurrenceStatus status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    @Column(nullable = false) private long version;
    public long getVersion() { return version; }
    void moderate(OccurrenceStatus target) {
        if (!status.canTransitionTo(target)) throw new IllegalStateException("Invalid transition");
        status = target; version++;
    }
    public void update(OccurrenceCategory category, String title, String description, String neighborhood,
            String reference) {
        this.category = category; this.title = title; this.description = description;
        this.neighborhood = neighborhood; this.locationReference = reference;
        this.version++;
    }
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
        if (imageKey != null) media.add(new OccurrenceMedia(this, imageKey, null, null, 0));
        this.status = OccurrenceStatus.PENDING;
        this.createdAt = createdAt;
    }

    public Double getLatitude() { return latitude; }
    public Double getLongitude() { return longitude; }
    public void locate(GeographicPoint point) {
        if (point != null) { latitude = point.latitude(); longitude = point.longitude(); }
    }

    public UUID getId() { return id; }
    public UUID getAuthorId() { return authorId; }
    public OccurrenceCategory getCategory() { return category; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public String getNeighborhood() { return neighborhood; }
    public String getLocationReference() { return locationReference; }
    public String getImageKey() {
        if (media.isEmpty() || !media.getFirst().kind().equals("IMAGE")) throw new com.project.software.urbanreports.storage.application.ImageNotFoundException("missing");
        return media.getFirst().getObjectKey();
    }
    public OccurrenceStatus getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
}
