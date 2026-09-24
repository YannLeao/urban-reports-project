package com.project.software.urbanreports.occurrence;

import java.time.Instant;
import java.util.UUID;

public record OccurrenceResponse(UUID id, Integer categoryId, String categoryName, String title,
        String description, String neighborhood, String reference, OccurrenceStatus status, Instant createdAt) {
    static OccurrenceResponse from(Occurrence occurrence) {
        return new OccurrenceResponse(occurrence.getId(), occurrence.getCategory().getId(),
                occurrence.getCategory().getName(), occurrence.getTitle(), occurrence.getDescription(),
                occurrence.getNeighborhood(), occurrence.getLocationReference(), occurrence.getStatus(),
                occurrence.getCreatedAt());
    }
}
