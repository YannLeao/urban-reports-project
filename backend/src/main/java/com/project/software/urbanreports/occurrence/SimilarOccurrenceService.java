package com.project.software.urbanreports.occurrence;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class SimilarOccurrenceService {
    // Mean spherical Earth radius in metres; no rounding before filtering.
    static final double EARTH_RADIUS_METERS = 6371008.8;
    static final String SQL = """
            SELECT EXISTS(SELECT 1
            FROM (
                SELECT 2 * 6371008.8 * asin(sqrt(least(1.0, greatest(0.0,
                        power(sin(radians(o.latitude - ?) / 2), 2)
                        + cos(radians(?)) * cos(radians(o.latitude))
                        * power(sin(radians(o.longitude - ?) / 2), 2))))) AS distance
                FROM occurrences o
                WHERE o.category_id = ? AND o.status IN ('PENDING', 'ACCEPTED')
                    AND o.latitude BETWEEN -90 AND 90 AND o.longitude BETWEEN -180 AND 180
                    AND (CAST(? AS uuid) IS NULL OR o.id <> CAST(? AS uuid))
            ) candidates
            WHERE distance <= 100)
            """;
    private final JdbcTemplate jdbc;
    SimilarOccurrenceService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public Result read(UUID userId, SimilarOccurrenceRequest input) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM occurrence_categories WHERE id = ?)", Boolean.class, input.categoryId())))
            throw new IllegalArgumentException();
        if (input.excludeOccurrenceId() != null && !Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM occurrences WHERE id = ? AND author_id = ?)", Boolean.class, input.excludeOccurrenceId(), userId)))
            throw new OccurrenceNotFoundException(input.excludeOccurrenceId());
        boolean hasSimilar = Boolean.TRUE.equals(jdbc.queryForObject(SQL, Boolean.class,
                input.latitude(), input.latitude(), input.longitude(), input.categoryId(), input.excludeOccurrenceId(), input.excludeOccurrenceId()));
        return new Result(hasSimilar);
    }
    public record Result(boolean hasSimilar) {}
}
