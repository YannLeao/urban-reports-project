package com.project.software.urbanreports.support;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;

public final class ImageFixtures {
    private ImageFixtures() {}

    public static byte[] photo(String extension) {
        return resource("photo." + extension);
    }

    public static byte[] resource(String name) {
        try (var stream = ImageFixtures.class.getResourceAsStream("/images/" + name)) {
            return java.util.Objects.requireNonNull(stream).readAllBytes();
        } catch (IOException exception) { throw new java.io.UncheckedIOException(exception); }
    }

    public static byte[] png(int width, int height) throws IOException {
        var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        try (var output = new ByteArrayOutputStream()) {
            if (!ImageIO.write(image, "png", output)) throw new IOException("PNG writer missing");
            return output.toByteArray();
        } finally { image.flush(); }
    }

    // A real PNG ancillary chunk, with a valid CRC; no trailing garbage or forged header.
    public static byte[] pngOfSize(int size) throws IOException {
        byte[] original = photo("png");
        int length = size - original.length - 12;
        try (var output = new ByteArrayOutputStream(size); var data = new DataOutputStream(output)) {
            data.write(original, 0, original.length - 12);
            data.writeInt(length);
            byte[] type = {'p', 'a', 'D', 'd'};
            data.write(type);
            byte[] padding = new byte[length];
            data.write(padding);
            var crc = new CRC32(); crc.update(type); crc.update(padding);
            data.writeInt((int) crc.getValue());
            data.write(original, original.length - 12, 12);
            return output.toByteArray();
        }
    }

    public static byte[] pngWithDimensions(int width, int height) {
        byte[] bytes = photo("png");
        ByteBuffer.wrap(bytes).putInt(16, width).putInt(20, height);
        var crc = new CRC32(); crc.update(bytes, 12, 17);
        ByteBuffer.wrap(bytes).putInt(29, (int) crc.getValue());
        return bytes;
    }
}
