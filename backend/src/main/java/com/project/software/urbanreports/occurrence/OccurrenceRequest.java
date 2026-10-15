package com.project.software.urbanreports.occurrence;

public record OccurrenceRequest(Integer categoryId, String title, String description,
        String neighborhood, String reference, String latitude, String longitude) {
    public OccurrenceRequest(Integer categoryId, String title, String description,
            String neighborhood, String reference) {
        this(categoryId, title, description, neighborhood, reference, null, null);
    }
}
