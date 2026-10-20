package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.storage.application.*;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.util.Set;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

@Service
public class MediaDelivery {
    private final ObjectProvider<ImageStorage> provider;
    private final Semaphore slots = new Semaphore(4);
    private final ExecutorService copies = new ThreadPoolExecutor(4, 4, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(4),
        Thread.ofPlatform().daemon().name("media-copy-", 0).factory(), new ThreadPoolExecutor.AbortPolicy());
    private final Set<Runnable> aborts = ConcurrentHashMap.newKeySet();
    public MediaDelivery(ObjectProvider<ImageStorage> provider) { this.provider = provider; }
    public void deliver(MediaAccess.Reference ref, HttpServletRequest request, HttpServletResponse response) throws IOException {
        var storage = provider.getIfAvailable();
        if (storage == null) throw new ImageStorageException("Storage unavailable");
        if (!slots.tryAcquire()) throw new VideoException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, "MEDIA_BUSY");
        boolean delegated = false;
        MediaObject source = null;
        try {
            var info = storage.head(ref.key());
            if (info.size() < 1 || info.size() > VideoValidator.MAX_BYTES || !"video/mp4".equals(info.contentType())
                || !java.util.Objects.equals(ref.size(), info.size())) throw new ImageStorageException("Invalid media metadata");
            response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("Accept-Ranges", "bytes");
            long size = info.size();
            if (request.getMethod().equals("HEAD")) { response.setContentType("video/mp4"); response.setStatus(200); response.setContentLengthLong(size); return; }
            ByteRange range = request.getHeader("If-Range") == null ? ByteRange.parse(request.getHeader("Range"), size) : null;
            if (range != null && range.start() < 0) { response.setStatus(416); response.setHeader("Content-Range", "bytes */" + size); response.setContentLengthLong(0); return; }
            long length = range == null ? size : range.length();
            source = storage.open(ref.key(), range == null ? null : range.start(), range == null ? null : range.end());
            response.setContentType("video/mp4");
            response.setStatus(range == null ? 200 : 206); response.setContentLengthLong(length);
            if (range != null) response.setHeader("Content-Range", "bytes " + range.start() + "-" + range.end() + "/" + size);
            var async = request.startAsync(); async.setTimeout(30000);
            var resource = source; var finished = new AtomicBoolean();
            Runnable abort = () -> { resource.abort(); complete(async); };
            Runnable release = () -> { if (finished.compareAndSet(false, true)) { resource.abort(); slots.release(); aborts.remove(abort); } };
            aborts.add(abort);
            async.addListener(new AsyncListener() {
                public void onComplete(AsyncEvent e) { resource.abort(); }
                public void onTimeout(AsyncEvent e) { resource.abort(); complete(async); }
                public void onError(AsyncEvent e) { resource.abort(); complete(async); }
                public void onStartAsync(AsyncEvent e) { }
            });
            try {
                copies.execute(() -> {
                    try {
                        var out = response.getOutputStream(); var input = resource.input();
                        byte[] buffer = new byte[16384]; long remaining = length;
                        while (remaining > 0 && !finished.get()) {
                            int count = input.read(buffer, 0, (int) Math.min(remaining, buffer.length));
                            if (count < 0) throw new EOFException();
                            out.write(buffer, 0, count); remaining -= count;
                        }
                        if (!finished.get() && remaining == 0) { out.flush(); resource.close(); }
                    } catch (IOException | RuntimeException failure) {
                        // Body may be committed. Never append JSON or expose provider diagnostics.
                        org.slf4j.LoggerFactory.getLogger(MediaDelivery.class).debug("media stage=copy category=cancelled-or-io");
                    } finally { release.run(); complete(async); }
                });
                delegated = true;
            } catch (RejectedExecutionException failure) { release.run(); response.setStatus(503); response.setContentLengthLong(0); complete(async); delegated = true; }
        } finally { if (!delegated) { if (source != null) source.abort(); slots.release(); } }
    }
    private static void complete(AsyncContext async) {
        try { async.complete(); } catch (IllegalStateException ignored) { /* Already completed by transport. */ }
    }
    @PreDestroy void shutdown() { aborts.forEach(Runnable::run); copies.shutdownNow(); }
}
