package com.project.software.urbanreports.storage.application;

import java.io.InputStream;

public interface ImageStorage {

    StoredImage store(InputStream content, long contentLength, String contentType);

    default StoredImage store(InputStream content, long contentLength, String contentType, String prefix) {
        return store(content, contentLength, contentType);
    }

    StoredImageContent load(String key);

    record Metadata(long size, String contentType) {}
    default Metadata head(String key) { throw new ImageStorageException("Metadata unavailable"); }
    default MediaObject open(String key, Long start, Long end) { throw new ImageStorageException("Streaming unavailable"); }

    default void storeAt(String key, InputStream content, long contentLength, String contentType) {
        throw new ImageStorageException("Explicit destination upload is not supported");
    }

    default void storeAt(String key, long size, String contentType, java.util.function.Supplier<InputStream> source) {
        try (var input = source.get()) { storeAt(key, input, size, contentType); }
        catch (java.io.IOException failure) { throw new ImageStorageException("Upload could not be read"); }
    }

    default void delete(String key) {
        throw new ImageStorageException("Deletion is not supported");
    }
}
