package com.project.software.urbanreports.occurrence;

import java.util.UUID;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Sort;

public interface OccurrenceRepository extends JpaRepository<Occurrence, UUID> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select o from Occurrence o where o.id = :id and o.authorId = :authorId")
    java.util.Optional<Occurrence> lockOwned(UUID id, UUID authorId);
	List<Occurrence> findByAuthorId(UUID authorId, Sort sort);
	java.util.Optional<Occurrence> findByIdAndAuthorId(UUID id, UUID authorId);
}
