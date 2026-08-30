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
        String key = "proofs/" + UUID.randomUUID() + "." + extension(contentType);
        try {
            s3Client.putObject(PutObjectRequest.builder()
                            .bucket(properties.bucket())
                            .key(key)
                            .contentType(contentType)
                            .contentLength(contentLength)
                            .build(),
                    RequestBody.fromInputStream(content, contentLength));
            LOGGER.info("Stored technical proof image with key {}", key);
            return new StoredImage(key);
        } catch (RuntimeException exception) {
            LOGGER.error("Failed to store technical proof image with key {}: {}",
                    key, exception.getClass().getSimpleName());
            throw new ImageStorageException("Image storage provider failed", exception);
        }
    }

    @Override
    public StoredImageContent load(String key) {
        try {
            var response = s3Client.getObjectAsBytes(GetObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(key)
                    .build());
            String contentType = response.response().contentType();
            byte[] content = response.asByteArray();
            LOGGER.info("Loaded technical proof image with key {}", key);
            return new StoredImageContent(content, content.length, contentType);
        } catch (NoSuchKeyException exception) {
            LOGGER.info("Technical proof image was not found for key {}", key);
            throw new ImageNotFoundException(key);
        } catch (S3Exception exception) {
            if (exception.statusCode() == 404) {
                LOGGER.info("Technical proof image was not found for key {}", key);
                throw new ImageNotFoundException(key);
            }
            logAndThrow(key, exception);
            throw new AssertionError("unreachable");
        } catch (RuntimeException exception) {
            logAndThrow(key, exception);
            throw new AssertionError("unreachable");
        }
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
        LOGGER.error("Failed to load technical proof image with key {}: {}",
                key, exception.getClass().getSimpleName());
        throw new ImageStorageException("Image storage provider failed", exception);
    }
}
