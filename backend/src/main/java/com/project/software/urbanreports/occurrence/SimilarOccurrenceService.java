package com.project.software.urbanreports.occurrence;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class SimilarOccurrenceService {
    static final int RADIUS_METERS = 100, LIMIT = 5;
    // Mean spherical Earth radius in metres; no rounding before filtering/ordering.
    static final double EARTH_RADIUS_METERS = 6371008.8;
    static final String SQL = """
            SELECT id, category_id, name, title, neighborhood, reference, status, created_at, distance
            FROM (
                SELECT o.id, o.category_id, c.name, o.title, o.neighborhood, o.reference, o.status, o.created_at,
                    2 * 6371008.8 * asin(sqrt(least(1.0, greatest(0.0,
                        power(sin(radians(o.latitude - ?) / 2), 2)
                        + cos(radians(?)) * cos(radians(o.latitude))
                        * power(sin(radians(o.longitude - ?) / 2), 2))))) AS distance
                FROM occurrences o JOIN occurrence_categories c ON c.id = o.category_id
                WHERE o.category_id = ? AND o.status IN ('PENDING', 'IN_ANALYSIS')
                    AND o.latitude BETWEEN -90 AND 90 AND o.longitude BETWEEN -180 AND 180
                    AND (CAST(? AS uuid) IS NULL OR o.id <> CAST(? AS uuid))
            ) candidates
            WHERE distance <= 100 ORDER BY distance ASC, created_at DESC, id DESC LIMIT 5
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
        var items = jdbc.query(SQL, (rs, index) -> new Item(rs.getObject("id", UUID.class), rs.getInt("category_id"),
                rs.getString("name"), rs.getString("title"), rs.getString("neighborhood"), rs.getString("reference"),
                OccurrenceStatus.valueOf(rs.getString("status")), rs.getTimestamp("created_at").toInstant(), rs.getDouble("distance")),
                input.latitude(), input.latitude(), input.longitude(), input.categoryId(), input.excludeOccurrenceId(), input.excludeOccurrenceId());
        return new Result(RADIUS_METERS, LIMIT, items);
    }
    public record Item(UUID id, int categoryId, String categoryName, String title, String neighborhood,
            String reference, OccurrenceStatus status, Instant createdAt, double distanceMeters) {}
    public record Result(int radiusMeters, int limit, List<Item> items) {}
}
