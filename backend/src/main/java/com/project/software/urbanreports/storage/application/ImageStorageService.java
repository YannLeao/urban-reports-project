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
        if (file.isEmpty()) {
            throw new InvalidImageException("Image must not be empty");
        }
        if (file.getSize() > MAX_IMAGE_SIZE) {
            throw new InvalidImageException("Image must not exceed 5 MB");
        }

        ImageFormat format = ImageFormat.fromDeclaredContentType(file.getContentType());
        byte[] content = readContent(file);
        if (!format.matches(content)) {
            throw new InvalidImageException("Image content does not match the declared media type");
        }

        try {
            StoredImage stored = storage().store(
                    new ByteArrayInputStream(content), content.length, format.contentType());
            return publicId(stored.key());
        } catch (ImageStorageException exception) {
            LOGGER.error("Technical image upload failed: {}", exception.getClass().getSimpleName());
            throw exception;
        }
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
                throw new InvalidImageException("Image must not exceed 5 MB");
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
