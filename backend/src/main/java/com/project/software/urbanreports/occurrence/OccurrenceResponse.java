package com.project.software.urbanreports.occurrence;

import java.time.Instant;
import java.util.UUID;

public record OccurrenceResponse(UUID id, Integer categoryId, String categoryName, String title,
        String description, String neighborhood, String reference, Double latitude, Double longitude, OccurrenceStatus status, Instant createdAt, long version,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
        java.util.List<OccurrenceHistory.AuthorEvent> history) {
    static OccurrenceResponse from(Occurrence occurrence) {
        return from(occurrence, null);
    }

    static OccurrenceResponse from(Occurrence occurrence, java.util.List<OccurrenceHistory.AuthorEvent> history) {
        return new OccurrenceResponse(occurrence.getId(), occurrence.getCategory().getId(),
                occurrence.getCategory().getName(), occurrence.getTitle(), occurrence.getDescription(),
                occurrence.getNeighborhood(), occurrence.getLocationReference(), occurrence.getLatitude(), occurrence.getLongitude(), occurrence.getStatus(),
                occurrence.getCreatedAt(), occurrence.getVersion(), history);
    }
}
