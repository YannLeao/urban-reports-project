package com.project.software.urbanreports.occurrence;

import java.util.List;
import java.util.UUID;
import org.springframework.data.repository.Repository;

// Deliberately exposes no update/delete methods. Database triggers also protect
// writes outside Hibernate; the future command will append inside its transaction.
public interface OccurrenceHistoryRepository extends Repository<OccurrenceHistory, UUID> {
    List<OccurrenceHistory> findByOccurrenceIdOrderByOccurredAtAscVersionAsc(UUID occurrenceId);
}
