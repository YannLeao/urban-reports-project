package com.project.software.urbanreports.occurrence;

public record OccurrenceRequest(Integer categoryId, String title, String description,
        String neighborhood, String reference) {
}
