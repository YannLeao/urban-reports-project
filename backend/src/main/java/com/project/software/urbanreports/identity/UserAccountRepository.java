package com.project.software.urbanreports.identity;

import java.util.UUID;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;

public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {
    Optional<UserAccount> findByEmail(String email);

    // Shared protocol: lock account first, then recovery token (future), then sessions.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UserAccount u where u.id = :id")
    Optional<UserAccount> lockById(UUID id);
}
