package com.project.software.urbanreports.occurrence;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Read legacy append-only events without expanding the current status contract. */
@Converter
public class OccurrenceHistoryStatusConverter implements AttributeConverter<OccurrenceStatus, String> {
    @Override
    public OccurrenceStatus convertToEntityAttribute(String value) {
        return value == null ? null : OccurrenceStatus.valueOf(value.equals("IN_ANALYSIS") ? "ACCEPTED" : value);
    }

    @Override
    public String convertToDatabaseColumn(OccurrenceStatus value) {
        return value == null ? null : value.name();
    }
}
