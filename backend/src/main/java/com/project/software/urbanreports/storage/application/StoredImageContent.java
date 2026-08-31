package com.project.software.urbanreports.storage.application;

public record StoredImageContent(byte[] content, long contentLength, String contentType) {

    public StoredImageContent {
        content = content.clone();
    }

    @Override
    public byte[] content() {
        return content.clone();
    }
}
