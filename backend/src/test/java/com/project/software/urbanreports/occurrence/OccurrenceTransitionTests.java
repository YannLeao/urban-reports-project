package com.project.software.urbanreports.occurrence;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class OccurrenceTransitionTests {
    @Test void allSixteenStatePairsFollowTheContract() {
        for (var source : OccurrenceStatus.values()) {
            for (var target : OccurrenceStatus.values()) {
                var command = new OccurrenceTransition(target, target == OccurrenceStatus.REJECTED ? "Justificativa válida" : null).validated();
                boolean allowed = (source == OccurrenceStatus.PENDING && (target == OccurrenceStatus.IN_ANALYSIS || target == OccurrenceStatus.REJECTED))
                        || (source == OccurrenceStatus.IN_ANALYSIS && (target == OccurrenceStatus.RESOLVED || target == OccurrenceStatus.REJECTED));
                if (allowed) assertThatCode(() -> command.check(source, 3, "\"3\"")).doesNotThrowAnyException();
                else assertThatThrownBy(() -> command.check(source, 3, "\"3\""))
                        .isInstanceOfSatisfying(OccurrenceWriteException.class, error -> assertThat(error.status.value()).isEqualTo(409));
            }
        }
    }

    @Test void rejectionUsesCodePointsAndTheSharedAsciiTrimWithoutTruncation() {
        for (String value : new String[] {"a".repeat(10), "a".repeat(500), "😀".repeat(10), "😀".repeat(500)}) {
            assertThat(new OccurrenceTransition(OccurrenceStatus.REJECTED, "\t\n " + value + "\r ").validated().reason()).isEqualTo(value);
        }
        for (String value : new String[] {"", " \t\n ", "a".repeat(9), "a".repeat(501), "😀".repeat(9), "😀".repeat(501), "a".repeat(10) + "\uD800", "a".repeat(10) + "\0"}) {
            assertThatThrownBy(() -> new OccurrenceTransition(OccurrenceStatus.REJECTED, value).validated()).isInstanceOf(OccurrenceValidationException.class);
        }
        assertThatThrownBy(() -> new OccurrenceTransition(OccurrenceStatus.REJECTED, null).validated()).isInstanceOf(OccurrenceValidationException.class);
        // Non-ASCII whitespace is content, matching the existing occurrence contract.
        assertThat(new OccurrenceTransition(OccurrenceStatus.REJECTED, "\u00a0".repeat(10)).validated().reason()).hasSize(10);
    }

    @Test void onlyRejectionAcceptsAnyNonNullReason() {
        for (var target : OccurrenceStatus.values()) {
            if (target == OccurrenceStatus.REJECTED) continue;
            assertThatCode(() -> new OccurrenceTransition(target, null).validated()).doesNotThrowAnyException();
            for (String reason : new String[] {"", " ", "Justificativa indevida"}) {
                assertThatThrownBy(() -> new OccurrenceTransition(target, reason).validated()).isInstanceOf(OccurrenceValidationException.class);
            }
        }
        assertThatThrownBy(() -> new OccurrenceTransition(null, null).validated()).isInstanceOf(OccurrenceValidationException.class);
    }

    @Test void preconditionsRejectMissingOrStaleVersionBeforeStateConflicts() {
        var command = new OccurrenceTransition(OccurrenceStatus.IN_ANALYSIS, null).validated();
        assertThatThrownBy(() -> command.check(OccurrenceStatus.PENDING, 2, null))
                .isInstanceOfSatisfying(OccurrenceWriteException.class, error -> assertThat(error.status.value()).isEqualTo(428));
        for (String match : new String[] {"\"1\"", "2", "*", "W/\"2\"", "\"2\", \"3\""}) {
            assertThatThrownBy(() -> command.check(OccurrenceStatus.RESOLVED, 2, match))
                    .isInstanceOfSatisfying(OccurrenceWriteException.class, error -> assertThat(error.status.value()).isEqualTo(412));
        }
    }
}
