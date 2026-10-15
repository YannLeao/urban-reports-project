package com.project.software.urbanreports.notification;

import java.util.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;

public interface OccurrenceNotificationRepository extends JpaRepository<OccurrenceNotification, UUID> {
    Page<OccurrenceNotification> findByRecipientId(UUID recipientId, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select n from OccurrenceNotification n where n.id = :id and n.recipientId = :recipientId")
    Optional<OccurrenceNotification> lockOwned(UUID id, UUID recipientId);
}
