package com.project.software.urbanreports.storage.application;

import com.project.software.urbanreports.support.ImageFixtures;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.*;

class ImageContentValidationTests {
    @ParameterizedTest @ValueSource(strings = {"jpg", "png", "webp"})
    void decodesRealPixels(String extension) {
        ImageContentValidation.validate(ImageFixtures.photo(extension), format(extension));
    }

    @ParameterizedTest @ValueSource(strings = {"jpg", "png", "webp"})
    void rejectsTruncationAndWrongMime(String extension) {
        byte[] original = ImageFixtures.photo(extension);
        byte[] truncated = Arrays.copyOf(original, original.length - 16);
        assertThatThrownBy(() -> ImageContentValidation.validate(truncated, format(extension)))
                .isInstanceOf(InvalidImageException.class);
        assertThatThrownBy(() -> ImageContentValidation.validate(original,
                extension.equals("png") ? ImageFormat.JPEG : ImageFormat.PNG))
                .isInstanceOf(InvalidImageException.class);
    }

    @Test void rejectsJpegRecoveredWithWarningDespiteEndMarker() {
        byte[] original = ImageFixtures.photo("jpg");
        byte[] truncated = Arrays.copyOf(original, original.length - 8);
        truncated[truncated.length - 2] = (byte) 0xff;
        truncated[truncated.length - 1] = (byte) 0xd9;
        assertThatThrownBy(() -> ImageContentValidation.validate(truncated, ImageFormat.JPEG))
                .isInstanceOf(InvalidImageException.class);
    }

    @Test void rejectsMultipleJpegImages() {
        byte[] original = ImageFixtures.photo("jpg");
        byte[] sequence = Arrays.copyOf(original, original.length * 2);
        System.arraycopy(original, 0, sequence, original.length, original.length);
        assertThatThrownBy(() -> ImageContentValidation.validate(sequence, ImageFormat.JPEG))
                .isInstanceOf(InvalidImageException.class).hasMessageContaining("estática");
    }

    @Test void rejectsTruncatedWebpEvenWithConsistentContainerLengths() {
        byte[] truncated = Arrays.copyOf(ImageFixtures.photo("webp"), 40);
        java.nio.ByteBuffer.wrap(truncated).order(java.nio.ByteOrder.LITTLE_ENDIAN)
                .putInt(4, truncated.length - 8).putInt(16, truncated.length - 20);
        assertThatThrownBy(() -> ImageContentValidation.validate(truncated, ImageFormat.WEBP))
                .isInstanceOf(InvalidImageException.class);
    }

    @Test void rejectsForgedPngAndInvalidCrc() {
        byte[] original = ImageFixtures.photo("png");
        assertThatThrownBy(() -> ImageContentValidation.validate(Arrays.copyOf(original, 16), ImageFormat.PNG))
                .isInstanceOf(InvalidImageException.class);
        original[original.length - 1] ^= 1;
        assertThatThrownBy(() -> ImageContentValidation.validate(original, ImageFormat.PNG))
                .isInstanceOf(InvalidImageException.class);
    }

    @ParameterizedTest @ValueSource(strings = {"png", "webp"})
    void rejectsRealAnimations(String extension) {
        assertThatThrownBy(() -> ImageContentValidation.validate(ImageFixtures.resource("animated." + extension), format(extension)))
                .isInstanceOf(InvalidImageException.class).hasMessageContaining("estática");
    }

    @Test void rejectsDimensionsBeforeTryingToDecodePixels() {
        for (int[] dimensions : new int[][]{{8193, 1}, {1, 8193}, {5001, 5000}, {Integer.MAX_VALUE, Integer.MAX_VALUE}}) {
            assertThatThrownBy(() -> ImageContentValidation.validate(
                    ImageFixtures.pngWithDimensions(dimensions[0], dimensions[1]), ImageFormat.PNG))
                    .isInstanceOf(InvalidImageException.class).hasMessageContaining("8192");
        }
    }

    @Test void decodesLargeValidImageAtPixelLimit() throws Exception {
        byte[] bytes = ImageFixtures.png(5000, 5000);
        long start = System.nanoTime();
        ImageContentValidation.validate(bytes, ImageFormat.PNG);
        System.out.printf("Image validation: 5000x5000, %d compressed bytes, %d ms, max heap %d MiB%n",
                bytes.length, (System.nanoTime() - start) / 1_000_000, Runtime.getRuntime().maxMemory() / 1024 / 1024);
    }

    @Test void acceptsInclusiveSideAndByteLimits() throws Exception {
        ImageContentValidation.validate(ImageFixtures.png(8192, 1), ImageFormat.PNG);
        ImageContentValidation.validate(ImageFixtures.pngOfSize(5 * 1024 * 1024), ImageFormat.PNG);
    }

    private static ImageFormat format(String extension) {
        return switch (extension) { case "jpg" -> ImageFormat.JPEG; case "png" -> ImageFormat.PNG; default -> ImageFormat.WEBP; };
    }
}
