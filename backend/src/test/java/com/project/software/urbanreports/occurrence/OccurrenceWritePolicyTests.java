package com.project.software.urbanreports.occurrence;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class OccurrenceWritePolicyTests {
    @Test void rejectsStateOutsidePendingAtDomainBoundary() {
        // No persisted non-PENDING state exists; null represents a disallowed domain boundary fixture.
        assertThatThrownBy(() -> OccurrenceService.checkWritable(null, 0, "\"0\""))
                .isInstanceOfSatisfying(OccurrenceWriteException.class,
                        failure -> assertThat(failure.status.value()).isEqualTo(409));
    }
}
