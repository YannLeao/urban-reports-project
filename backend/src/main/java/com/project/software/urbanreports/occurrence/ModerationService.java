package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.administration.*;
import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import com.project.software.urbanreports.identity.AccountRole;
import com.project.software.urbanreports.storage.application.*;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@Transactional(propagation = Propagation.NEVER)
public class ModerationService {
    private final OccurrenceFilterParser filters;
    private final OccurrenceRepository occurrences;
    private final AccountAccess access;
    private final JdbcTemplate jdbc;
    private final ImageStorageService images;
    private final Clock clock;
    private final TransactionTemplate transaction;
    public ModerationService(OccurrenceRepository occurrences, AccountAccess access, JdbcTemplate jdbc,
            ImageStorageService images, Clock clock, PlatformTransactionManager manager, OccurrenceFilterParser filters) {
        this.occurrences = occurrences; this.access = access; this.jdbc = jdbc; this.images = images;
        this.filters = filters; this.clock = clock; this.transaction = new TransactionTemplate(manager);
    }
    public record Event(UUID id, OccurrenceStatus previousStatus, OccurrenceStatus newStatus, Instant occurredAt, String reason, String responsible) {}
    public record Detail(OccurrenceResponse report, List<Event> history) {}
    public record Queue(List<OccurrenceResponse> items, int page, int size, long totalItems, int totalPages) {}
    public Queue list(AuthenticatedIdentity actor, int page, int size) {
        return list(actor, page, size, new org.springframework.util.LinkedMultiValueMap<>());
    }
    public Queue list(AuthenticatedIdentity actor, int page, int size, org.springframework.util.MultiValueMap<String, String> params) {
        return transaction.execute(status -> {
            access.lock(actor, AccountRole.ADMIN);
            AdminProvisioningService.checkPage(page, size);
            var criteria = filters.parse(params, OccurrenceFilters.Context.ADMIN);
            var result = occurrences.findAll(criteria.specification(OccurrenceFilters.Context.ADMIN, null),
                    PageRequest.of(page, size, Sort.by("createdAt", "id")));
            return new Queue(result.map(OccurrenceResponse::administrative).getContent(), page, size, result.getTotalElements(), result.getTotalPages());
        });
    }
    public Detail find(AuthenticatedIdentity actor, UUID id) {
        return transaction.execute(status -> {
            access.lock(actor, AccountRole.ADMIN);
            return detail(occurrences.findById(id).orElseThrow(() -> new OccurrenceNotFoundException(id)));
        });
    }
    public StoredImageContent image(AuthenticatedIdentity actor, UUID id) { return media(actor, id, null); }
    public StoredImageContent media(AuthenticatedIdentity actor, UUID id, UUID mediaId) {
        String key = transaction.execute(status -> {
            access.lock(actor, AccountRole.ADMIN);
            var report = occurrences.findById(id).orElseThrow(() -> new OccurrenceNotFoundException(id));
            return mediaId == null ? report.getImageKey() : report.mediaKey(mediaId);
        });
        return images.loadOccurrence(key);
    }
    public Detail transition(AuthenticatedIdentity actor, UUID id, String match, OccurrenceTransition input) {
        return transaction.execute(status -> {
            access.lock(actor, AccountRole.ADMIN);
            var command = input.validated();
            var occurrence = occurrences.lockById(id).orElseThrow(() -> new OccurrenceNotFoundException(id));
            command.check(occurrence.getStatus(), occurrence.getVersion(), match);
            var previous = occurrence.getStatus();
            occurrence.moderate(command.target());
            occurrences.flush();
            jdbc.update("INSERT INTO occurrence_history(id, occurrence_id, previous_status, new_status, moderator_id, occurred_at, reason, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    UUID.randomUUID(), id, previous.name(), command.target().name(), actor.userId(), java.sql.Timestamp.from(clock.instant()), command.reason(), occurrence.getVersion());
            // The history trigger writes exactly one durable notification intent in this transaction.
            return detail(occurrence);
        });
    }
    private Detail detail(Occurrence report) {
        var events = jdbc.query("""
                SELECT h.id, h.previous_status, h.new_status, h.occurred_at, h.reason, a.name
                FROM occurrence_history h JOIN user_accounts a ON a.id = h.moderator_id
                WHERE h.occurrence_id = ? ORDER BY h.occurred_at, h.version
                """, (rs, row) -> new Event(rs.getObject(1, UUID.class), OccurrenceStatus.valueOf(rs.getString(2)),
                        OccurrenceStatus.valueOf(rs.getString(3)), rs.getTimestamp(4).toInstant(), rs.getString(5), rs.getString(6)), report.getId());
        return new Detail(OccurrenceResponse.administrative(report), events);
    }
}
