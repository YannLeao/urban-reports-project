package com.project.software.urbanreports.storage.application;

public class ImageNotFoundException extends RuntimeException {

    public ImageNotFoundException(String key) {
        super("Image not found: " + key);
    }
}
