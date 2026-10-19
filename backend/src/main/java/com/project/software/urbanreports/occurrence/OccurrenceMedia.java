package com.project.software.urbanreports.occurrence;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "occurrence_media")
public class OccurrenceMedia {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "occurrence_id", nullable = false) private Occurrence occurrence;
    @Column(name = "object_key", nullable = false, unique = true, length = 255) private String objectKey;
    @Column(nullable = false, length = 16) private String kind = "IMAGE";
    @Column(name = "content_type", length = 32) private String contentType;
    @Column(name = "size_bytes") private Long sizeBytes;
    @Column(nullable = false) private int position;
    protected OccurrenceMedia() {}
    OccurrenceMedia(Occurrence occurrence, String key, String contentType, Long sizeBytes, int position) {
        this.id = UUID.randomUUID(); this.occurrence = occurrence; this.objectKey = key;
        this.contentType = contentType; this.sizeBytes = sizeBytes; this.position = position;
    }
    public UUID getId() { return id; }
    public String getObjectKey() { return objectKey; }
    void position(int value) { position = value; }
    public record Response(UUID id, String type, String mime, Long sizeBytes, int position, String endpoint) {}
    Response response(String base) { return new Response(id, kind, contentType, sizeBytes, position, base + "/media/" + id); }
}
