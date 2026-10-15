package com.project.software.urbanreports.occurrence;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class OccurrenceWritePolicyTests {
    @Test void rejectsStateOutsidePendingAtDomainBoundary() {
        for (var state : new OccurrenceStatus[] {OccurrenceStatus.IN_ANALYSIS, OccurrenceStatus.RESOLVED, OccurrenceStatus.REJECTED}) {
            assertThatThrownBy(() -> OccurrenceService.checkWritable(state, 0, "\"0\""))
                    .isInstanceOfSatisfying(OccurrenceWriteException.class,
                            failure -> assertThat(failure.status.value()).isEqualTo(409));
        }
    }
}
