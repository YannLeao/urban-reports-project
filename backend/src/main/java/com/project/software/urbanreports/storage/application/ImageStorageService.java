package com.project.software.urbanreports.storage.application;

import org.springframework.beans.factory.ObjectProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.regex.Pattern;

@Service
public class ImageStorageService {

    private static final Logger LOGGER = LoggerFactory.getLogger(ImageStorageService.class);
    static final long MAX_IMAGE_SIZE = 5L * 1024 * 1024;
    private static final Pattern PUBLIC_ID = Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp)$");

    private final ObjectProvider<ImageStorage> storageProvider;

    public ImageStorageService(ObjectProvider<ImageStorage> storageProvider) {
        this.storageProvider = storageProvider;
    }

    public String store(MultipartFile file) {
        return publicId(storeWithPrefix(file, "proofs"));
    }

    public record PreparedImage(String key, byte[] content, String contentType) {}

    public PreparedImage prepareOccurrence(MultipartFile file) {
        if (file.isEmpty() || file.getSize() > MAX_IMAGE_SIZE) {
            throw new InvalidImageException("A imagem deve ser não vazia e ter no máximo 5 MiB.");
        }
        ImageFormat format = ImageFormat.fromDeclaredContentType(file.getContentType());
        byte[] content = readContent(file);
        ImageContentValidation.validate(content, format);
        storage(); // Fail before recording an intent when storage is unavailable.
        return new PreparedImage("occurrences/" + java.util.UUID.randomUUID() + "." + format.extension(),
                content, format.contentType());
    }

    public void upload(PreparedImage image) {
        storage().storeAt(image.key(), new ByteArrayInputStream(image.content()),
                image.content().length, image.contentType());
    }

    public void delete(String key) {
        if (key == null || !(key.startsWith("proofs/") || key.startsWith("occurrences/"))) {
            throw new ImageStorageException("Storage returned an invalid image key");
        }
        try {
            storage().delete(key);
        } catch (ImageStorageException exception) {
            LOGGER.error("Technical image deletion failed: {}", exception.getClass().getSimpleName());
            throw exception;
        }
    }

    private String storeWithPrefix(MultipartFile file, String prefix) {
        if (file.isEmpty()) {
            throw new InvalidImageException("Image must not be empty");
        }
        if (file.getSize() > MAX_IMAGE_SIZE) {
            throw new InvalidImageException("A imagem deve ter no máximo 5 MiB (5.242.880 bytes).");
        }

        ImageFormat format = ImageFormat.fromDeclaredContentType(file.getContentType());
        byte[] content = readContent(file);
        ImageContentValidation.validate(content, format);

        try {
                StoredImage stored = storage().store(
                    new ByteArrayInputStream(content), content.length, format.contentType(), prefix);
            if (stored.key() == null || !stored.key().startsWith(prefix + "/")) {
                throw new ImageStorageException("Storage returned an invalid image key");
            }
            return stored.key();
        } catch (ImageStorageException exception) {
            LOGGER.error("Technical image upload failed: {}", exception.getClass().getSimpleName());
            throw exception;
        }
    }

    public StoredImageContent loadOccurrence(String key) {
        if (key == null || !key.matches("occurrences/[0-9a-f-]{36}\\.(jpg|png|webp)"))
            throw new ImageStorageException("Invalid occurrence image association");
        var image = storage().load(key);
        byte[] bytes = image.content();
        if (bytes.length == 0 || bytes.length > MAX_IMAGE_SIZE) throw new ImageStorageException("Invalid stored image size");
        try {
            var format = ImageFormat.fromDeclaredContentType(image.contentType());
            ImageContentValidation.validate(bytes, format);
            return new StoredImageContent(bytes, bytes.length, format.contentType());
        } catch (InvalidImageException failure) { throw new ImageStorageException("Invalid stored image content"); }
    }

    public StoredImageContent load(String id) {
        if (!PUBLIC_ID.matcher(id).matches()) {
            throw new ImageNotFoundException(id);
        }
        try {
            return storage().load("proofs/" + id);
        } catch (ImageStorageException exception) {
            LOGGER.error("Technical image retrieval failed for id {}: {}",
                    id, exception.getClass().getSimpleName());
            throw exception;
        }
    }

    private byte[] readContent(MultipartFile file) {
        try (var input = file.getInputStream()) {
            byte[] content = input.readNBytes((int) MAX_IMAGE_SIZE + 1);
            if (content.length > MAX_IMAGE_SIZE) {
                throw new InvalidImageException("A imagem deve ter no máximo 5 MiB (5.242.880 bytes).");
            }
            return content;
        } catch (IOException exception) {
            throw new InvalidImageException("Image could not be read");
        }
    }

    private ImageStorage storage() {
        ImageStorage storage = storageProvider.getIfAvailable();
        if (storage == null) {
            throw new ImageStorageException("Image storage is not configured");
        }
        return storage;
    }

    private String publicId(String key) {
        if (key == null || !key.startsWith("proofs/")) {
            throw new ImageStorageException("Storage returned an invalid image key");
        }
        String id = key.substring("proofs/".length());
        if (!PUBLIC_ID.matcher(id).matches()) {
            throw new ImageStorageException("Storage returned an invalid image key");
        }
        return id;
    }
}
