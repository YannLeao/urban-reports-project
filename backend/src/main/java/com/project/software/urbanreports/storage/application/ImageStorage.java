package com.project.software.urbanreports.storage.application;

import java.io.InputStream;

public interface ImageStorage {

    StoredImage store(InputStream content, long contentLength, String contentType);

    StoredImageContent load(String key);
}
