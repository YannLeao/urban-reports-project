package com.project.software.urbanreports.storage.application;

import com.project.software.urbanreports.support.ImageFixtures;

/** Invoked explicitly inside the built runtime image; requires no database or credentials. */
public final class ImageDecoderRuntimeProbe {
    private ImageDecoderRuntimeProbe() {}
    public static void main(String[] args) throws Exception {
        for (ImageFormat format : ImageFormat.values()) {
            ImageContentValidation.validate(ImageFixtures.photo(format.extension()), format);
            System.out.println("Decoded " + format.contentType());
        }
        byte[] large = ImageFixtures.png(5000, 5000);
        long start = System.nanoTime();
        ImageContentValidation.validate(large, ImageFormat.PNG);
        System.out.printf("Decoded 25,000,000 pixels, %d compressed bytes, %d ms; max heap %d MiB%n",
                large.length, (System.nanoTime() - start) / 1_000_000, Runtime.getRuntime().maxMemory() / 1024 / 1024);
    }
}
