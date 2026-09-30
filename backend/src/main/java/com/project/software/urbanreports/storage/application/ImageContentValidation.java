package com.project.software.urbanreports.storage.application;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStreamImpl;

/** Structural checks complement decoding: recovering a partial image is not acceptance. */
final class ImageContentValidation {
    static final int MAX_SIDE = 8192;
    static final long MAX_PIXELS = 25_000_000;
    private static final String INVALID = "Imagem inválida ou incompleta. Escolha outro JPEG, PNG ou WebP.";
    private static final String STATIC_ONLY = "Envie uma fotografia estática. Imagens animadas ou com múltiplos frames não são aceitas.";

    private ImageContentValidation() {}

    static void validate(byte[] bytes, ImageFormat format) {
        if (!format.matches(bytes)) throw invalid();
        if (format == ImageFormat.PNG) png(bytes);
        if (format == ImageFormat.WEBP) webp(bytes);
        try (var input = new BoundedImageInput(bytes)) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw invalid();
            ImageReader reader = readers.next();
            try {
                String detected = reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!detected.equals(format == ImageFormat.JPEG ? "jpeg" : format.extension())) throw invalid();
                reader.addIIOReadWarningListener((source, warning) -> { throw invalid(); });
                // Skip optional metadata; original bytes and orientation are preserved on upload.
                reader.setInput(input, false, true);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width <= 0 || height <= 0 || width > MAX_SIDE || height > MAX_SIDE
                        || (long) width * height > MAX_PIXELS) {
                    throw new InvalidImageException("A imagem deve ter lados de até 8192 pixels e no máximo 25.000.000 pixels no total.");
                }
                if (reader.getNumImages(true) != 1) throw new InvalidImageException(STATIC_ONLY);
                var decoded = reader.read(0);
                if (decoded == null) throw invalid();
                try {
                    if (decoded.getWidth() != width || decoded.getHeight() != height) throw invalid();
                    input.checkBudget();
                } finally {
                    decoded.flush();
                }
            } finally {
                reader.dispose();
            }
        } catch (InvalidImageException exception) {
            throw exception;
        } catch (IOException | RuntimeException exception) {
            // Never return decoder messages, metadata or submitted content to the caller.
            throw invalid();
        }
    }

    private static void png(byte[] bytes) {
        int offset = 8;
        boolean header = false, data = false;
        while (offset <= bytes.length - 12) {
            long size = unsigned(bytes, offset, ByteOrder.BIG_ENDIAN);
            if (size > bytes.length - offset - 12) throw invalid();
            int length = (int) size;
            String type = ascii(bytes, offset + 4);
            if (!header && (!type.equals("IHDR") || length != 13)) throw invalid();
            if (header && type.equals("IHDR")) throw invalid();
            header = true;
            if (type.equals("acTL") || type.equals("fcTL") || type.equals("fdAT")) {
                throw new InvalidImageException(STATIC_ONLY);
            }
            var crc = new CRC32();
            crc.update(bytes, offset + 4, length + 4);
            if (crc.getValue() != unsigned(bytes, offset + 8 + length, ByteOrder.BIG_ENDIAN)) throw invalid();
            if (type.equals("IDAT")) data = true;
            offset += length + 12;
            if (type.equals("IEND")) {
                if (length != 0 || !data || offset != bytes.length) throw invalid();
                return;
            }
        }
        throw invalid();
    }

    private static void webp(byte[] bytes) {
        if (unsigned(bytes, 4, ByteOrder.LITTLE_ENDIAN) != bytes.length - 8L) throw invalid();
        int offset = 12, frames = 0;
        while (offset <= bytes.length - 8) {
            String type = ascii(bytes, offset);
            long size = unsigned(bytes, offset + 4, ByteOrder.LITTLE_ENDIAN);
            long padded = size + (size & 1);
            if (padded > bytes.length - offset - 8) throw invalid();
            if (type.equals("ANIM") || type.equals("ANMF")
                    || (type.equals("VP8X") && size > 0 && (bytes[offset + 8] & 2) != 0)) {
                throw new InvalidImageException(STATIC_ONLY);
            }
            if (type.equals("VP8 ") || type.equals("VP8L")) frames++;
            offset += 8 + (int) padded;
        }
        if (offset != bytes.length || frames != 1) throw invalid();
    }

    private static long unsigned(byte[] bytes, int offset, ByteOrder order) {
        return Integer.toUnsignedLong(ByteBuffer.wrap(bytes, offset, 4).order(order).getInt());
    }

    private static String ascii(byte[] bytes, int offset) {
        return new String(bytes, offset, 4, StandardCharsets.US_ASCII);
    }

    private static InvalidImageException invalid() { return new InvalidImageException(INVALID); }

    /** Zero-copy input; limits apply to repeated reads/seeks as well as input length.
     * The deadline is checked on I/O, not a promise to preempt CPU-only decoder work. */
    private static final class BoundedImageInput extends ImageInputStreamImpl {
        private final byte[] bytes;
        private final long deadline = System.nanoTime() + 5_000_000_000L;
        private long remainingBytes = 128L * 1024 * 1024;
        private int operations = 2_000_000;

        BoundedImageInput(byte[] bytes) { this.bytes = bytes; }

        void checkBudget() throws IOException {
            if (--operations < 0 || remainingBytes < 0 || System.nanoTime() - deadline >= 0) {
                throw new IOException("Image decoding I/O budget exceeded");
            }
        }

        @Override public int read() throws IOException {
            checkClosed(); checkBudget(); bitOffset = 0;
            if (streamPos >= bytes.length) return -1;
            remainingBytes--;
            return bytes[(int) streamPos++] & 0xff;
        }

        @Override public int read(byte[] target, int offset, int length) throws IOException {
            java.util.Objects.checkFromIndexSize(offset, length, target.length);
            checkClosed(); checkBudget(); bitOffset = 0;
            if (length == 0) return 0;
            if (streamPos >= bytes.length) return -1;
            int count = (int) Math.min(length, bytes.length - streamPos);
            remainingBytes -= count; checkBudget();
            System.arraycopy(bytes, (int) streamPos, target, offset, count);
            streamPos += count;
            return count;
        }

        @Override public void seek(long position) throws IOException {
            checkBudget();
            if (position > bytes.length) throw new IOException("Seek outside image");
            super.seek(position);
        }

        @Override public long length() { return bytes.length; }
    }
}
