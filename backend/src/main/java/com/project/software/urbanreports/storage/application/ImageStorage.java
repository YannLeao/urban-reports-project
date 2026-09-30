package com.project.software.urbanreports.storage.application;

import java.io.InputStream;

public interface ImageStorage {

    StoredImage store(InputStream content, long contentLength, String contentType);

    default StoredImage store(InputStream content, long contentLength, String contentType, String prefix) {
        return store(content, contentLength, contentType);
    }

    StoredImageContent load(String key);

    default void storeAt(String key, InputStream content, long contentLength, String contentType) {
        throw new ImageStorageException("Explicit destination upload is not supported");
    }

    default void delete(String key) {
        throw new ImageStorageException("Deletion is not supported");
    }
}
