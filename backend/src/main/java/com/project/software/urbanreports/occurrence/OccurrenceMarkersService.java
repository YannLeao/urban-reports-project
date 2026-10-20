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
    public OccurrenceMarkersController.MarkerSet read(UUID authorId) { return read(authorId, OccurrenceFilters.empty()); }

    @Transactional(readOnly = true)
    public OccurrenceMarkersController.MarkerSet read(UUID authorId, OccurrenceFilters filters) {
        // One statement: metadata and points share PostgreSQL's statement snapshot.
        // Select only map fields; no entities, images, identity, version or history.
        var args = new java.util.ArrayList<Object>();
        String predicate = authorId == null ? "o.status IN (?, ?, ?)" : "o.author_id = ?";
        if (authorId == null) OccurrenceFilters.PUBLIC_STATES.forEach(state -> args.add(state.name()));
        else args.add(authorId);
        if (filters.categoryId() != null) { predicate += " AND o.category_id = ?"; args.add(filters.categoryId()); }
        if (filters.status() != null) { predicate += " AND o.status = ?"; args.add(filters.status().name()); }
        String sql = """
                SELECT o.id, o.category_id, c.name, o.title, o.status, o.latitude, o.longitude
                FROM occurrences o JOIN occurrence_categories c ON c.id = o.category_id
                WHERE %s ORDER BY o.created_at DESC, o.id DESC
                """.formatted(predicate);
        var rows = jdbc.query(sql, (rs, index) -> new OccurrenceMarkersController.Marker(
                rs.getObject(1, UUID.class), rs.getInt(2), rs.getString(3), rs.getString(4),
                OccurrenceStatus.valueOf(rs.getString(5)), rs.getObject(6, Double.class), rs.getObject(7, Double.class)),
                args.toArray());
        var points = rows.stream().filter(row -> row.latitude() != null && row.longitude() != null).toList();
        return new OccurrenceMarkersController.MarkerSet(points, rows.size(), points.size(), rows.size() - points.size());
    }
}
