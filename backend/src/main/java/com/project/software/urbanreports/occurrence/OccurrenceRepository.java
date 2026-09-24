package com.project.software.urbanreports.occurrence;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OccurrenceRepository extends JpaRepository<Occurrence, UUID> {
}
