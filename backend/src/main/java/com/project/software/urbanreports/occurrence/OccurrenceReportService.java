package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.administration.AccountAccess;
import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import com.project.software.urbanreports.identity.AccountRole;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class OccurrenceReportService {
    private final JdbcTemplate jdbc;
    private final AccountAccess access;

    public OccurrenceReportService(JdbcTemplate jdbc, AccountAccess access) {
        this.jdbc = jdbc; this.access = access;
    }

    public record CategoryCount(int categoryId, String categoryName, long count) {}
    public record StatusCount(OccurrenceStatus status, long count) {}
    // Null key distinguishes missing locality from the literal text "Não informado".
    public record LocalityCount(@Schema(nullable = true, description = "Texto após trim ASCII externo; null significa Não informado") String locality, long count) {}
    public record Report(long total, List<CategoryCount> categories, List<StatusCount> statuses,
            List<LocalityCount> localities,
            @Schema(nullable = true, description = "Média em segundos contínuos; null sem duração válida", minimum = "0") BigDecimal averageResolutionSeconds,
            long resolvedSampleSize, long resolvedWithoutValidDuration,
            @Schema(nullable = true, description = "100 × rejeitadas / total; null com total zero", minimum = "0", maximum = "100") BigDecimal rejectedPercentage,
            Instant generatedAt) {}
    private record Summary(long total, BigDecimal percentage, Instant generatedAt) {}
    private record Resolution(BigDecimal average, long valid, long invalid) {}

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ, propagation = Propagation.REQUIRES_NEW)
    public Report get(AuthenticatedIdentity actor) {
        access.check(actor, AccountRole.ADMIN);
        var summary = jdbc.queryForObject("""
                SELECT count(*), 100.0 * count(*) FILTER (WHERE status = 'REJECTED') / nullif(count(*), 0),
                       transaction_timestamp()
                FROM occurrences
                """, (rs, row) -> new Summary(rs.getLong(1), rs.getBigDecimal(2), rs.getTimestamp(3).toInstant()));
        var categories = jdbc.query("""
                SELECT c.id, c.name, count(o.id) FROM occurrence_categories c
                LEFT JOIN occurrences o ON o.category_id = c.id GROUP BY c.id, c.name ORDER BY c.id
                """, (rs, row) -> new CategoryCount(rs.getInt(1), rs.getString(2), rs.getLong(3)));
        var statuses = jdbc.query("""
                SELECT s.status, count(o.id) FROM
                (VALUES ('PENDING', 1), ('IN_ANALYSIS', 2), ('RESOLVED', 3), ('REJECTED', 4)) s(status, position)
                LEFT JOIN occurrences o ON o.status = s.status
                GROUP BY s.status, s.position ORDER BY s.position
                """, (rs, row) -> new StatusCount(OccurrenceStatus.valueOf(rs.getString(1)), rs.getLong(2)));
        var localities = jdbc.query("""
                SELECT locality, amount FROM (
                    SELECT nullif(btrim(neighborhood, E'\\t\\n\\013\\014\\r '), '') AS locality, count(*) AS amount
                    FROM occurrences GROUP BY locality
                ) grouped ORDER BY amount DESC, locality COLLATE "C" ASC NULLS LAST
                """, (rs, row) -> new LocalityCount(rs.getString(1), rs.getLong(2)));
        var resolution = jdbc.queryForObject("""
                WITH history AS (
                    SELECT occurrence_id,
                        count(*) FILTER (WHERE new_status = 'RESOLVED') AS resolutions,
                        count(*) FILTER (WHERE new_status IN ('RESOLVED', 'REJECTED')) AS finals,
                        max(occurred_at) FILTER (WHERE new_status = 'RESOLVED') AS resolved_at,
                        max(version) FILTER (WHERE new_status = 'RESOLVED') AS resolved_version,
                        max(version) AS last_version, max(occurred_at) AS last_at, min(occurred_at) AS first_at
                    FROM occurrence_history GROUP BY occurrence_id
                ), durations AS (
                    SELECT CASE WHEN h.resolutions = 1 AND h.finals = 1
                        AND h.resolved_version = o.version AND h.last_version = o.version
                        AND h.last_at = h.resolved_at AND h.first_at >= o.created_at
                        THEN extract(epoch FROM (h.resolved_at - o.created_at)) END AS seconds
                    FROM occurrences o LEFT JOIN history h ON h.occurrence_id = o.id WHERE o.status = 'RESOLVED'
                )
                SELECT avg(seconds), count(seconds), count(*) - count(seconds) FROM durations
                """, (rs, row) -> new Resolution(rs.getBigDecimal(1), rs.getLong(2), rs.getLong(3)));
        return new Report(summary.total(), categories, statuses, localities, resolution.average(),
                resolution.valid(), resolution.invalid(), summary.percentage(), summary.generatedAt());
    }
}
