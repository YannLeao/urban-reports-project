package com.project.software.urbanreports.occurrence;

import java.io.*;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;

class VideoValidatorTests {
    static byte[] fixture(String name) throws IOException {
        try (var input = VideoValidatorTests.class.getResourceAsStream("/videos/" + name + ".mp4")) { return input.readAllBytes(); }
    }
    static MockMultipartFile video(byte[] bytes) { return new MockMultipartFile("video", "private-marker.mp4", "video/mp4", bytes); }
    @Test void acceptsRealPortraitAudioAndThirtySecondsAndCleansSpool() throws Exception {
        var validator = new VideoValidator(30);
        for (String name : new String[]{"h264-aac", "h264-portrait", "h264-rotated", "h264-30s"}) {
            Path path;
            try (var result = validator.prepare(video(fixture(name)))) {
                path = result.path();
                assertThat(Files.size(path)).isEqualTo(result.size());
                assertThat(Files.readAllBytes(path)).isEqualTo(fixture(name));
                assertThat(result.metadata().durationSeconds()).isBetween(0.9, 30.000002);
                assertThat(result.metadata().width()).isEqualTo(name.contains("portrait") ? 240 : 320);
            }
            assertThat(path).doesNotExist();
        }
    }
    @Test void invalidFilesAndMimeCannotPassAsVideo() throws Exception {
        var validator = new VideoValidator(30);
        assertThatThrownBy(() -> validator.prepare(video(new byte[0]))).isInstanceOf(VideoException.class).hasMessage("INVALID_VIDEO");
        assertThatThrownBy(() -> validator.prepare(video("not mp4 private-marker".getBytes()))).hasMessage("INVALID_VIDEO");
        byte[] valid = fixture("h264-aac");
        assertThatThrownBy(() -> validator.prepare(new MockMultipartFile("video", "x.mp4", "video/quicktime", valid))).hasMessage("INVALID_VIDEO");
        assertThatThrownBy(() -> validator.prepare(video(java.util.Arrays.copyOf(valid, valid.length / 2)))).hasMessage("INVALID_VIDEO");
        // Admission is released on every failure.
        try (var accepted = validator.prepare(video(valid))) { assertThat(accepted.size()).isPositive(); }
    }
    @Test void capacityHeldUntilUploadHandleClosesAndShutdownRejectsAdmission() throws Exception {
        var validator = new VideoValidator(30);
        try (var first = validator.prepare(video(fixture("h264-portrait")))) {
            assertThatThrownBy(() -> validator.prepare(video(fixture("h264-portrait")))).hasMessage("VIDEO_VALIDATION_BUSY");
        }
        try (var second = validator.prepare(video(fixture("h264-portrait")))) { assertThat(second.size()).isPositive(); }
        validator.shutdown();
        assertThatThrownBy(() -> validator.prepare(video(fixture("h264-portrait")))).hasMessage("VIDEO_VALIDATION_BUSY");
    }
    @Test void boundedCopyChecksActualBytesRatherThanClaimedSize() {
        var validator = new VideoValidator(30);
        var oversized = new MockMultipartFile("video", "x", "video/mp4", new byte[0]) {
            @Override public long getSize() { return 1; }
            @Override public InputStream getInputStream() {
                return new InputStream() { long remaining = VideoValidator.MAX_BYTES + 1;
                    public int read() { return remaining-- > 0 ? 0 : -1; }
                    public int read(byte[] b, int off, int len) { if (remaining <= 0) return -1; int n = (int)Math.min(remaining, len); remaining -= n; return n; }
                };
            }
        };
        assertThatThrownBy(() -> validator.prepare(oversized)).hasMessage("VIDEO_TOO_LARGE");
    }
    private java.util.List<String> command(String mode) {
        return java.util.List.of(System.getProperty("java.home") + "/bin/java", "-cp", System.getProperty("java.class.path"), VideoProcessProbe.class.getName(), mode);
    }
    @Test void subprocessEnvironmentOutputDeadlineAndInterruptionAreBounded() {
        var validator = new VideoValidator(30);
        assertThat(new String(validator.run(command("environment"), System.nanoTime() + 5_000_000_000L, 1024))).isEqualTo("[LC_ALL]");
        assertThatThrownBy(() -> validator.run(command("output"), System.nanoTime() + 5_000_000_000L, 1024)).hasMessage("INVALID_VIDEO");
        assertThatThrownBy(() -> validator.run(command("wait"), System.nanoTime() + 100_000_000L, 1024)).hasMessage("VIDEO_VALIDATION_UNAVAILABLE");
        Thread.currentThread().interrupt();
        try {
            assertThatThrownBy(() -> validator.run(command("wait"), System.nanoTime() + 5_000_000_000L, 1024)).hasMessage("VIDEO_VALIDATION_UNAVAILABLE");
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally { Thread.interrupted(); validator.shutdown(); }
    }
    @Test void selfContainedStructureRejectsExternalReferencesEncryptionAndMovBrand() throws Exception {
        byte[] bytes = fixture("h264-aac");
        for (String marker : new String[]{"dref", "stsd", "ftyp"}) {
            byte[] copy = bytes.clone();
            byte[] needle = marker.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);
            int at = -1;
            for (int i = 4; i < copy.length-16; i++) {
                if (java.util.Arrays.equals(copy, i, i+4, needle, 0, 4)) { at=i; break; }
            }
            assertThat(at).isPositive();
            if (marker.equals("dref")) copy[at+23] = 0; // URL self-contained flag is removed.
            else if (marker.equals("stsd")) System.arraycopy("encv".getBytes(),0,copy,at+16,4);
            else System.arraycopy("qt  ".getBytes(),0,copy,at+4,4);
            var validator = new VideoValidator(30);
            assertThatThrownBy(() -> validator.prepare(video(copy))).hasMessage("INVALID_VIDEO");
        }
    }
    @Test void realFilesOverDeclaredFrameDurationResolutionAndAudioBudgetsAreRejected() throws Exception {
        var validator = new VideoValidator(30);
        for (String name : new String[]{"reject-31fps", "reject-duration", "reject-resolution", "reject-audio-rate"})
            assertThatThrownBy(() -> validator.prepare(video(fixture(name)))).as(name).hasMessage("INVALID_VIDEO");
    }
    @Test void watchdogTerminatesDescendantsAndShutdownCleansPreparedFiles() throws Exception {
        var validator = new VideoValidator(30);
        Path pidFile = Files.createTempFile("video-child-test-", ".pid");
        try {
            var args = new java.util.ArrayList<>(command("spawn")); args.add(pidFile.toString());
            assertThatThrownBy(() -> validator.run(args,System.nanoTime()+1_500_000_000L,1024)).hasMessage("VIDEO_VALIDATION_UNAVAILABLE");
            long pid = Long.parseLong(Files.readString(pidFile));
            var child = ProcessHandle.of(pid);
            if(child.isPresent()) {
                try { child.get().onExit().get(3,java.util.concurrent.TimeUnit.SECONDS); }
                finally { child.get().destroyForcibly(); }
            }
            try(var prepared = validator.prepare(video(fixture("h264-portrait")))) {
                Path path = prepared.path(); validator.shutdown(); assertThat(path).doesNotExist();
            }
        } finally { Files.deleteIfExists(pidFile); validator.shutdown(); }
    }
    @Test void dimensionsAndConfigurationAreBounded() {
        VideoValidator.dimensions(1280, 720); VideoValidator.dimensions(720, 1280);
        for (int[] dimensions : new int[][]{{1281,720},{1280,721},{0,720},{1000,1000},{Integer.MAX_VALUE,Integer.MAX_VALUE}})
            assertThatThrownBy(() -> VideoValidator.dimensions(dimensions[0], dimensions[1])).hasMessage("INVALID_VIDEO");
        assertThatThrownBy(() -> new VideoValidator(31)).isInstanceOf(IllegalArgumentException.class);
    }
}
