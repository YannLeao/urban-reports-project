package com.project.software.urbanreports.occurrence;

import java.util.UUID;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Sort;

public interface OccurrenceRepository extends JpaRepository<Occurrence, UUID> {
	List<Occurrence> findByAuthorId(UUID authorId, Sort sort);
	java.util.Optional<Occurrence> findByIdAndAuthorId(UUID id, UUID authorId);
}
