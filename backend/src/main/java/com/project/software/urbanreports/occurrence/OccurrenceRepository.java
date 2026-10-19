package com.project.software.urbanreports.occurrence;

import java.util.UUID;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Sort;

public interface OccurrenceRepository extends JpaRepository<Occurrence, UUID> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select o from Occurrence o where o.id = :id")
    java.util.Optional<Occurrence> lockById(UUID id);
    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = "category")
    org.springframework.data.domain.Page<Occurrence> findByStatusIn(java.util.Collection<OccurrenceStatus> states, org.springframework.data.domain.Pageable page);
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select o from Occurrence o where o.id = :id and o.authorId = :authorId")
    java.util.Optional<Occurrence> lockOwned(UUID id, UUID authorId);
    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = "category")
	List<Occurrence> findByAuthorId(UUID authorId, Sort sort);
	java.util.Optional<Occurrence> findByIdAndAuthorId(UUID id, UUID authorId);
    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = "category")
    org.springframework.data.domain.Page<Occurrence> findAllBy(org.springframework.data.domain.Pageable pageable);
    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = "category")
    org.springframework.data.domain.Page<Occurrence> findByStatusNot(OccurrenceStatus status, org.springframework.data.domain.Pageable pageable);
    java.util.Optional<Occurrence> findByIdAndStatusNot(UUID id, OccurrenceStatus status);
}
