package com.project.software.urbanreports.occurrence;

import jakarta.annotation.PreDestroy;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
public class VideoValidator {
    public static final long MAX_BYTES = 26214400;
    private final Semaphore slot = new Semaphore(1);
    private final Set<Path> temporaries = ConcurrentHashMap.newKeySet();
    private final Set<Process> active = ConcurrentHashMap.newKeySet();
    private final AtomicBoolean closed = new AtomicBoolean();
    private final int timeout;
    private boolean toolsChecked;
    private final JsonMapper json = JsonMapper.builder().build();
    public VideoValidator(@Value("${video.validation.timeout-seconds:30}") int timeout) {
        if (timeout < 1 || timeout > 30) throw new IllegalArgumentException("Video timeout must be 1–30 seconds");
        this.timeout = timeout;
    }
    public record Metadata(double durationSeconds, int width, int height) {}
    public static final class Prepared implements AutoCloseable {
        private final Path path;
        private final long size;
        private final Metadata metadata;
        private final Runnable release;
        private final AtomicBoolean closed = new AtomicBoolean();
        Prepared(Path path, long size, Metadata metadata, Runnable release) {
            this.path = path; this.size = size; this.metadata = metadata; this.release = release;
        }
        public Path path() { return path; }
        public long size() { return size; }
        public Metadata metadata() { return metadata; }
        public void close() {
            if (!closed.compareAndSet(false, true)) return;
            try { Files.deleteIfExists(path); }
            catch (IOException failure) { throw VideoException.unavailable(); }
            finally { release.run(); }
        }
        InputStream open() throws IOException { return Files.newInputStream(path); }
    }
    public Prepared prepare(MultipartFile upload) {
        if (closed.get() || !slot.tryAcquire()) throw new VideoException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, "VIDEO_VALIDATION_BUSY");
        long started = System.nanoTime();
        Path path = null; boolean transferred = false;
        try {
            if (!"video/mp4".equals(upload.getContentType())) throw VideoException.invalid();
            if (upload.getSize() > MAX_BYTES) throw new VideoException(org.springframework.http.HttpStatus.CONTENT_TOO_LARGE, "VIDEO_TOO_LARGE");
            path = Files.createTempFile("occurrence-video-", ".mp4"); temporaries.add(path);
            long size = 0;
            try (var in = upload.getInputStream(); var out = Files.newOutputStream(path)) {
                byte[] buffer = new byte[16384]; int count;
                while ((count = in.read(buffer)) != -1) {
                    size += count;
                    if (size > MAX_BYTES) throw new VideoException(org.springframework.http.HttpStatus.CONTENT_TOO_LARGE, "VIDEO_TOO_LARGE");
                    out.write(buffer, 0, count);
                }
            }
            if (size == 0) throw VideoException.invalid();
            Mp4Structure.validate(path);
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeout);
            if (!toolsChecked) {
                for (String executable : List.of("/usr/bin/ffprobe", "/usr/bin/ffmpeg")) {
                    String available = new String(run(List.of(executable, "-v", "error", "-decoders"), deadline, 131072), java.nio.charset.StandardCharsets.UTF_8);
                    if (!available.matches("(?s).*\\n\\s*V[.A-Z]{5}\\s+(h264|libopenh264)\\s+.*")
                        || !available.matches("(?s).*\\n\\s*A[.A-Z]{5}\\s+(aac|aac_fixed|libfdk_aac)\\s+.*")) throw VideoException.unavailable();
                }
                toolsChecked = true;
            }
            var probe = new ArrayList<>(List.of("/usr/bin/ffprobe", "-v", "error", "-max_alloc", "33554432"));
            probe.addAll(inputOptions());
            probe.addAll(List.of("-threads", "1", "-err_detect", "explode", "-show_entries",
                "format=duration:stream=index,codec_type,codec_name,codec_tag_string,profile,level,pix_fmt,width,height,coded_width,coded_height,field_order,nb_frames,sample_aspect_ratio,r_frame_rate,avg_frame_rate,duration,sample_rate,channels:stream_disposition=attached_pic:stream_side_data=rotation", "-of", "json", path.toString()));
            JsonNode info = json.readTree(run(probe, deadline, 32768));
            var streams = info.get("streams");
            if (streams == null || !streams.isArray() || streams.size() < 1 || streams.size() > 2) throw VideoException.invalid();
            JsonNode video = null;
            int audioIndex = -1;
            double declared = positive(info.path("format").path("duration").asString());
            for (var stream : streams) {
                double duration = positive(stream.path("duration").asString());
                if (duration > 30.000001) throw VideoException.invalid();
                if (stream.path("codec_type").asString().equals("video")) {
                    if (video != null || !stream.path("codec_name").asString().equals("h264")
                        || !Set.of("avc1", "avc3").contains(stream.path("codec_tag_string").asString())
                        || !Set.of("Baseline", "Constrained Baseline", "Main", "High").contains(stream.path("profile").asString())
                        || !stream.path("pix_fmt").asString().equals("yuv420p")
                        || stream.path("level").asInt() < 1 || stream.path("level").asInt() > 41
                        || !stream.path("field_order").asString().equals("progressive")
                        || stream.path("disposition").path("attached_pic").asInt() != 0) throw VideoException.invalid();
                    dimensions(stream.path("width").asInt(), stream.path("height").asInt());
                    dimensions(stream.path("coded_width").asInt(), stream.path("coded_height").asInt());
                    String[] aspect = stream.path("sample_aspect_ratio").asString("1:1").split(":");
                    if (aspect.length != 2) throw VideoException.invalid();
                    double displayed = stream.path("width").asInt() * positive(aspect[0]) / positive(aspect[1]);
                    if (displayed > 1280 || displayed < 1) throw VideoException.invalid();
                    dimensions((int)Math.ceil(displayed), stream.path("height").asInt());
                    for (var side : stream.path("side_data_list")) {
                        if (side.has("rotation") && side.get("rotation").asDouble() % 90 != 0) throw VideoException.invalid();
                    }
                    for (String rate : List.of("r_frame_rate", "avg_frame_rate")) {
                        String[] fraction = stream.path(rate).asString().split("/");
                        if (fraction.length != 2 || positive(fraction[0]) / positive(fraction[1]) > 30.000001) throw VideoException.invalid();
                    }
                    video = stream;
                } else if (stream.path("codec_type").asString().equals("audio")) {
                    int channels = stream.path("channels").asInt();
                    if (audioIndex != -1 || !stream.path("codec_name").asString().equals("aac")
                        || !stream.path("profile").asString().equals("LC") || channels < 1 || channels > 2
                        || positive(stream.path("sample_rate").asString()) > 48000) throw VideoException.invalid();
                    audioIndex = stream.path("index").asInt();
                } else throw VideoException.invalid();
            }
            if (video == null || declared > 30.000001) throw VideoException.invalid();
            var framesCommand = new ArrayList<>(List.of("/usr/bin/ffprobe", "-v", "error", "-max_alloc", "33554432"));
            framesCommand.addAll(inputOptions());
            framesCommand.addAll(List.of("-threads", "1", "-err_detect", "explode", "-show_entries",
                "frame=stream_index,best_effort_timestamp_time,duration_time,pkt_duration_time,width,height,pix_fmt,interlaced_frame,nb_samples,sample_rate", "-of", "json", path.toString()));
            var frames = json.readTree(run(framesCommand, deadline, 1048576)).path("frames");
            int count = 0, audioFrames = 0; double previous = -1, observed = 0, videoEnd = 0, audioPrevious = -1;
            for (var frame : frames) {
                double at = nonnegative(frame.path("best_effort_timestamp_time").asString());
                double duration = positive(frame.path("duration_time").asString(frame.path("pkt_duration_time").asString()));
                if (frame.path("stream_index").asInt() == video.path("index").asInt()) {
                    if (++count > 900 || count == 1 && at > 0.001 || previous >= 0 && at - previous < 1.0 / 30 - 0.000002
                        || frame.path("width").asInt() != video.path("width").asInt()
                        || frame.path("height").asInt() != video.path("height").asInt()
                        || !frame.path("pix_fmt").asString().equals("yuv420p") || frame.path("interlaced_frame").asInt() != 0) throw VideoException.invalid();
                    previous = at; videoEnd = at + duration;
                } else if (frame.path("stream_index").asInt() == audioIndex) {
                    if (++audioFrames > 3000 || at < audioPrevious) throw VideoException.invalid();
                    audioPrevious = at;
                } else throw VideoException.invalid();
                observed = Math.max(observed, at + duration);
                if (observed > 30.000002) throw VideoException.invalid();
            }
            // MP4 sample-table count must agree with actual decoded frames (including edited timelines).
            String declaredFrames = video.path("nb_frames").asString("N/A");
            if (!declaredFrames.equals("N/A") && (!declaredFrames.matches("[0-9]{1,3}") || Integer.parseInt(declaredFrames) != count)) throw VideoException.invalid();
            if (count == 0 || count / videoEnd > 30.0001 || audioIndex != -1 && audioFrames == 0 || Math.abs(observed - declared) > 0.05) throw VideoException.invalid();
            var decode = new ArrayList<>(List.of("/usr/bin/ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-xerror", "-max_alloc", "33554432", "-filter_threads", "1", "-filter_complex_threads", "1"));
            decode.addAll(inputOptions());
            decode.addAll(List.of("-threads", "1", "-err_detect", "explode", "-i", path.toString(), "-map", "0:v:0", "-map", "0:a?", "-threads", "1", "-f", "null", "-"));
            run(decode, deadline, 32768);
            Path ready = path;
            var prepared = new Prepared(path, size, new Metadata(observed, video.path("width").asInt(), video.path("height").asInt()), () -> { temporaries.remove(ready); slot.release(); });
            path = null; transferred = true;
            return prepared;
        } catch (VideoException failure) {
            if (failure.status.is5xxServerError()) org.slf4j.LoggerFactory.getLogger(getClass()).warn(
                "video stage=validation category={} elapsedMillis={}", failure.code, (System.nanoTime()-started)/1_000_000);
            throw failure;
        }
        catch (IOException failure) {
            org.slf4j.LoggerFactory.getLogger(getClass()).warn("video stage=spool category=io");
            throw VideoException.unavailable();
        }
        catch (RuntimeException failure) { throw VideoException.invalid(); }
        finally {
            try { if (path != null) Files.deleteIfExists(path); }
            catch (IOException failure) { org.slf4j.LoggerFactory.getLogger(getClass()).warn("video stage=cleanup category=io"); }
            if (!transferred) { if (path != null) temporaries.remove(path); slot.release(); }
        }
    }
    private static List<String> inputOptions() {
        return List.of("-protocol_whitelist", "file,pipe", "-format_whitelist", "mov", "-f", "mov", "-enable_drefs", "0", "-use_absolute_path", "0");
    }
    static void dimensions(int width, int height) {
        if (width < 1 || height < 1 || Math.max(width, height) > 1280 || Math.min(width, height) > 720 || (long) width * height > 921600) throw VideoException.invalid();
    }
    private static double nonnegative(String text) {
        try { double n = Double.parseDouble(text); if (!Double.isFinite(n) || n < 0) throw VideoException.invalid(); return n; }
        catch (NumberFormatException failure) { throw VideoException.invalid(); }
    }
    private static double positive(String text) { double n = nonnegative(text); if (n <= 0) throw VideoException.invalid(); return n; }
    byte[] run(List<String> command, long deadline, int limit) {
        Process process = null;
        try {
            if (closed.get()) throw VideoException.unavailable();
            var builder = new ProcessBuilder(command); builder.environment().clear(); builder.environment().put("LC_ALL", "C");
            process = builder.start(); active.add(process); process.getOutputStream().close();
            if (closed.get()) throw VideoException.unavailable();
            Process running = process;
            var readers = Executors.newVirtualThreadPerTaskExecutor();
            try {
                var stdout = readers.submit(() -> bounded(running.getInputStream(), limit, running));
                var stderr = readers.submit(() -> bounded(running.getErrorStream(), 32768, running));
                long remaining = deadline - System.nanoTime();
                if (remaining <= 0 || !process.waitFor(remaining, TimeUnit.NANOSECONDS)) { terminate(process); throw VideoException.unavailable(); }
                byte[] output = stdout.get(Math.max(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                byte[] errors = stderr.get(Math.max(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                if (process.exitValue() != 0 || errors.length != 0) {
                    String diagnostic = new String(errors, java.nio.charset.StandardCharsets.UTF_8);
                    if (diagnostic.contains("Unknown decoder") || diagnostic.contains("Decoder (codec") || diagnostic.contains("Decoding requested, but no decoder") || diagnostic.contains("Option not found")) throw VideoException.unavailable();
                    throw VideoException.invalid();
                }
                return output;
            } finally { terminate(process); readers.shutdownNow(); }
        } catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw VideoException.unavailable(); }
        catch (IOException | TimeoutException failure) { throw VideoException.unavailable(); }
        catch (ExecutionException failure) { throw VideoException.invalid(); }
        finally { if (process != null) { terminate(process); active.remove(process); } }
    }
    private static byte[] bounded(InputStream input, int limit, Process process) throws IOException {
        try (input; var out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) {
                if (out.size() + count > limit) { terminate(process); throw new IOException("Output limit"); }
                out.write(buffer, 0, count);
            }
            return out.toByteArray();
        }
    }
    private static void terminate(Process process) {
        var descendants = process.descendants().toList();
        descendants.forEach(ProcessHandle::destroyForcibly); process.destroyForcibly();
        boolean interrupted = Thread.interrupted();
        try { process.waitFor(1, TimeUnit.SECONDS); }
        catch (InterruptedException failure) { interrupted = true; }
        finally { if (interrupted) Thread.currentThread().interrupt(); }
        try { process.getInputStream().close(); } catch (IOException ignored) { }
        try { process.getErrorStream().close(); } catch (IOException ignored) { }
    }
    @PreDestroy void shutdown() {
        closed.set(true); active.forEach(VideoValidator::terminate);
        for (Path path : temporaries) {
            try { Files.deleteIfExists(path); }
            catch (IOException failure) { org.slf4j.LoggerFactory.getLogger(getClass()).warn("video stage=shutdown category=cleanup"); }
        }
    }
}
