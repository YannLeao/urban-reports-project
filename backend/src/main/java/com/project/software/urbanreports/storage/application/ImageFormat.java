package com.project.software.urbanreports.storage.application;

import java.util.Arrays;

enum ImageFormat {
    JPEG("image/jpeg", "jpg"),
    PNG("image/png", "png"),
    WEBP("image/webp", "webp");

    private static final byte[] PNG_SIGNATURE = {
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    };

    private final String contentType;
    private final String extension;

    ImageFormat(String contentType, String extension) {
        this.contentType = contentType;
        this.extension = extension;
    }

    String contentType() {
        return contentType;
    }

    String extension() {
        return extension;
    }

    static ImageFormat fromDeclaredContentType(String contentType) {
        return Arrays.stream(values())
                .filter(format -> format.contentType.equals(contentType))
                .findFirst()
                .orElseThrow(() -> new InvalidImageException("Only JPEG, PNG and WebP images are accepted"));
    }

    boolean matches(byte[] content) {
        return switch (this) {
            case JPEG -> content.length >= 4
                    && content[0] == (byte) 0xFF
                    && content[1] == (byte) 0xD8
                    && content[2] == (byte) 0xFF
                    && content[content.length - 2] == (byte) 0xFF
                    && content[content.length - 1] == (byte) 0xD9;
            case PNG -> content.length >= 16
                    && Arrays.equals(PNG_SIGNATURE, Arrays.copyOf(content, PNG_SIGNATURE.length))
                    && asciiEquals(content, 12, "IHDR");
            case WEBP -> content.length >= 16
                    && asciiEquals(content, 0, "RIFF")
                    && asciiEquals(content, 8, "WEBP")
                    && (asciiEquals(content, 12, "VP8 ")
                    || asciiEquals(content, 12, "VP8L")
                    || asciiEquals(content, 12, "VP8X"));
        };
    }

    private static boolean asciiEquals(byte[] content, int offset, String expected) {
        for (int index = 0; index < expected.length(); index++) {
            if (content[offset + index] != expected.charAt(index)) {
                return false;
            }
        }
        return true;
    }
}
