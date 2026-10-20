package com.project.software.urbanreports.occurrence;

import java.io.*;
import java.nio.file.*;
import org.springframework.web.multipart.MultipartFile;

/** Invoked through PropertiesLauncher in the final runtime, without Spring/DB/provider. */
public class VideoRuntimeProbe {
    public static void main(String[] args) throws Exception {
        var validator = new VideoValidator(30);
        for (String name : new String[]{"h264-aac", "h264-portrait", "h264-30s"}) {
            long start = System.nanoTime();
            try (var value = validator.prepare(new LocalFile(Path.of("/probe/videos/" + name + ".mp4")))) {
                System.out.printf("fixture=%s accepted=true bytes=%d seconds=%.6f validationMillis=%d heapUsed=%d%n",
                    name, value.size(), value.metadata().durationSeconds(), (System.nanoTime()-start)/1_000_000,
                    java.lang.management.ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed());
            }
        }
        validator.shutdown();
    }
    static class LocalFile implements MultipartFile {
        private final Path path;
        LocalFile(Path path) { this.path = path; }
        public String getName() { return "video"; }
        public String getOriginalFilename() { return "synthetic.mp4"; }
        public String getContentType() { return "video/mp4"; }
        public boolean isEmpty() { return getSize()==0; }
        public long getSize() { try { return Files.size(path); } catch (IOException failure) { throw new UncheckedIOException(failure); } }
        public byte[] getBytes() { throw new AssertionError("Whole-file buffering forbidden"); }
        public InputStream getInputStream() throws IOException { return Files.newInputStream(path); }
        public void transferTo(File destination) { throw new UnsupportedOperationException(); }
    }
}
