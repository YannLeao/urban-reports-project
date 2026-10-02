package com.project.software.urbanreports.occurrence;

import java.util.List;

public record PublicOccurrencePage(List<PublicOccurrenceResponse> items, int page, int size,
        long totalItems, int totalPages) {}