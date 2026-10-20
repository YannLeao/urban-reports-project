package com.project.software.urbanreports.occurrence;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class ByteRangeTests {
    @Test void closedOpenSuffixAndEndClamping() {
        assertThat(ByteRange.parse("bytes=2-4", 10)).isEqualTo(new ByteRange(2,4));
        assertThat(ByteRange.parse("bytes=2-", 10)).isEqualTo(new ByteRange(2,9));
        assertThat(ByteRange.parse("bytes=-3", 10)).isEqualTo(new ByteRange(7,9));
        assertThat(ByteRange.parse("bytes=-9999999999999999999999999", 10)).isEqualTo(new ByteRange(0,9));
        assertThat(ByteRange.parse("bytes=0-9999999999999999999999999", 10)).isEqualTo(new ByteRange(0,9));
        assertThat(ByteRange.parse("bytes=0-0", 1).length()).isEqualTo(1);
    }
    @Test void unsatisfiableIsDifferentFromMalformedAndOverflowNeverWraps() {
        for (String header : new String[]{"bytes=10-", "bytes=999999999999999999999999-", "bytes=-0"})
            assertThat(ByteRange.parse(header,10).start()).isEqualTo(-1);
        for (String header : new String[]{"bytes=5-4", "bytes=-", "items=1-3", "bytes=0-1,2-3", "bytes=NaN-", "bytes=" + "9".repeat(150) + "-"})
            assertThat(ByteRange.parse(header,10)).isNull();
    }
}
