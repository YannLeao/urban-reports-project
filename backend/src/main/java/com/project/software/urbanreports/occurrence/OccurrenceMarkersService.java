package com.project.software.urbanreports.occurrence;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class OccurrenceMarkersService {
    private final JdbcTemplate jdbc;
    OccurrenceMarkersService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public OccurrenceMarkersController.MarkerSet read(UUID authorId) {
        // One statement: metadata and points share PostgreSQL's statement snapshot.
        // Select only map fields; no entities, images, identity, version or history.
        String sql = """
                SELECT o.id, o.category_id, c.name, o.title, o.status, o.latitude, o.longitude
                FROM occurrences o JOIN occurrence_categories c ON c.id = o.category_id
                WHERE %s ORDER BY o.created_at DESC, o.id DESC
                """.formatted(authorId == null ? "o.status <> ?" : "o.author_id = ?");
        var rows = jdbc.query(sql, (rs, index) -> new OccurrenceMarkersController.Marker(
                rs.getObject(1, UUID.class), rs.getInt(2), rs.getString(3), rs.getString(4),
                OccurrenceStatus.valueOf(rs.getString(5)), rs.getObject(6, Double.class), rs.getObject(7, Double.class)),
                authorId == null ? OccurrenceStatus.REJECTED.name() : authorId);
        var points = rows.stream().filter(row -> row.latitude() != null && row.longitude() != null).toList();
        return new OccurrenceMarkersController.MarkerSet(points, rows.size(), points.size(), rows.size() - points.size());
    }
}
