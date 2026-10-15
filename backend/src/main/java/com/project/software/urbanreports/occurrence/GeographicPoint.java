package com.project.software.urbanreports.occurrence;

import java.util.List;
import java.util.Map;

/** WGS84 decimal degrees. Absence is a null pair, never zero. */
public record GeographicPoint(double latitude, double longitude) {
    public GeographicPoint {
        if (!Double.isFinite(latitude) || latitude < -90 || latitude > 90
                || !Double.isFinite(longitude) || longitude < -180 || longitude > 180)
            throw invalid();
    }

    static GeographicPoint parse(String latitude, String longitude, boolean required) {
        if (latitude == null && longitude == null && !required) return null;
        return new GeographicPoint(decimal(latitude), decimal(longitude));
    }

    private static double decimal(String value) {
        if (value == null || !value.matches("[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?"))
            throw invalid();
        try { return Double.parseDouble(value); }
        catch (NumberFormatException exception) { throw invalid(); }
    }

    private static OccurrenceValidationException invalid() {
        return new OccurrenceValidationException(Map.of("location", List.of("Informe latitude e longitude válidas e confirme o local.")));
    }
}
