package com.project.software.urbanreports.occurrence;

import java.time.Instant;
import java.util.UUID;

public record PublicOccurrenceResponse(UUID id, Integer categoryId, String categoryName, String title,
        String description, String neighborhood, String reference, Double latitude, Double longitude, OccurrenceStatus status, Instant createdAt) {
    static PublicOccurrenceResponse from(Occurrence occurrence) {
        return new PublicOccurrenceResponse(occurrence.getId(), occurrence.getCategory().getId(),
                occurrence.getCategory().getName(), occurrence.getTitle(), occurrence.getDescription(),
                occurrence.getNeighborhood(), occurrence.getLocationReference(), occurrence.getLatitude(), occurrence.getLongitude(), occurrence.getStatus(),
                occurrence.getCreatedAt());
    }
}