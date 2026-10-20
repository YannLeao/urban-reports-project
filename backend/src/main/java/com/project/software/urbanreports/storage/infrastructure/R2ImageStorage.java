package com.project.software.urbanreports.storage.infrastructure;

import com.project.software.urbanreports.storage.application.ImageNotFoundException;
import com.project.software.urbanreports.storage.application.ImageStorage;
import com.project.software.urbanreports.storage.application.ImageStorageException;
import com.project.software.urbanreports.storage.application.StoredImage;
import com.project.software.urbanreports.storage.application.StoredImageContent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.InputStream;
import java.util.UUID;

public class R2ImageStorage implements ImageStorage {

    private static final Logger LOGGER = LoggerFactory.getLogger(R2ImageStorage.class);

    private final S3Client s3Client;
    private final R2StorageProperties properties;

    public R2ImageStorage(S3Client s3Client, R2StorageProperties properties) {
        this.s3Client = s3Client;
        this.properties = properties;
    }

    @Override
    public StoredImage store(InputStream content, long contentLength, String contentType) {
        return store(content, contentLength, contentType, "proofs");
    }

    @Override
    public StoredImage store(InputStream content, long contentLength, String contentType, String prefix) {
        String key = prefix + "/" + UUID.randomUUID() + "." + extension(contentType);
        storeAt(key, content, contentLength, contentType);
        return new StoredImage(key);
    }

    @Override
    public void storeAt(String key, InputStream content, long contentLength, String contentType) {
        try {
            s3Client.putObject(PutObjectRequest.builder().bucket(properties.bucket()).key(key)
                    .contentType(contentType).contentLength(contentLength).build(),
                    RequestBody.fromInputStream(content, contentLength));
        } catch (RuntimeException exception) {
            throw new ImageStorageException("Image storage provider failed", exception);
        }
    }

    @Override
    public void storeAt(String key, long size, String contentType, java.util.function.Supplier<InputStream> source) {
        var current = new java.util.concurrent.atomic.AtomicReference<InputStream>();
        software.amazon.awssdk.http.ContentStreamProvider streams = () -> {
            closeUpload(current.getAndSet(null));
            var input = source.get(); current.set(input); return input;
        };
        try {
            s3Client.putObject(PutObjectRequest.builder().bucket(properties.bucket()).key(key)
                .contentType(contentType).contentLength(size).build(), RequestBody.fromContentProvider(streams, size, contentType));
        } catch (RuntimeException failure) { throw new ImageStorageException("Media upload unavailable"); }
        finally { closeUpload(current.getAndSet(null)); }
    }
    private static void closeUpload(InputStream input) {
        if (input != null) try { input.close(); } catch (java.io.IOException ignored) { }
    }

    @Override
    public void delete(String key) {
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(properties.bucket()).key(key).build());
        } catch (RuntimeException exception) {
            LOGGER.error("Image deletion failed: {}", exception.getClass().getSimpleName());
            throw new ImageStorageException("Image storage provider failed", exception);
        }
    }

    @Override
    public StoredImageContent load(String key) {
        try {
            try (var response = s3Client.getObject(GetObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(key)
                    .build())) {
            String contentType = response.response().contentType();
            byte[] content = response.readNBytes(5 * 1024 * 1024 + 1);
            if (content.length > 5 * 1024 * 1024) throw new ImageStorageException("Stored image exceeds limit");
            return new StoredImageContent(content, content.length, contentType);
            }
        } catch (java.io.IOException exception) {
            throw new ImageStorageException("Image could not be read", exception);
        } catch (NoSuchKeyException exception) {

            throw new ImageNotFoundException(key);
        } catch (S3Exception exception) {
            if (exception.statusCode() == 404) {

                throw new ImageNotFoundException(key);
            }
            logAndThrow(key, exception);
            throw new AssertionError("unreachable");
        } catch (RuntimeException exception) {
            logAndThrow(key, exception);
            throw new AssertionError("unreachable");
        }
    }

    @Override public Metadata head(String key) {
        try {
            var result = s3Client.headObject(software.amazon.awssdk.services.s3.model.HeadObjectRequest.builder()
                .bucket(properties.bucket()).key(key).build());
            return new Metadata(result.contentLength(), result.contentType());
        } catch (RuntimeException failure) { throw new ImageStorageException("Media metadata unavailable"); }
    }
    @Override public com.project.software.urbanreports.storage.application.MediaObject open(String key, Long start, Long end) {
        try {
            var request = GetObjectRequest.builder().bucket(properties.bucket()).key(key);
            if (start != null) request.range("bytes=" + start + "-" + end);
            var result = s3Client.getObject(request.build());
            if (start != null && (!java.util.Objects.equals(result.response().contentLength(), end - start + 1)
                || result.response().contentRange() == null || !result.response().contentRange().startsWith("bytes " + start + "-" + end + "/"))) {
                result.abort(); throw new ImageStorageException("Invalid range response");
            }
            return new com.project.software.urbanreports.storage.application.MediaObject() {
                public InputStream input() { return result; }
                public void abort() { result.abort(); }
                public void close() { try { result.close(); } catch (java.io.IOException failure) { result.abort(); } }
            };
        } catch (RuntimeException failure) { throw new ImageStorageException("Media stream unavailable"); }
    }

    private String extension(String contentType) {
        return switch (contentType) {
            case "image/jpeg" -> "jpg";
            case "image/png" -> "png";
            case "image/webp" -> "webp";
            default -> throw new ImageStorageException("Unsupported validated image type");
        };
    }

    private void logAndThrow(String key, RuntimeException exception) {
        LOGGER.error("Image retrieval failed: {}", exception.getClass().getSimpleName());
        throw new ImageStorageException("Image storage provider failed", exception);
    }
}
