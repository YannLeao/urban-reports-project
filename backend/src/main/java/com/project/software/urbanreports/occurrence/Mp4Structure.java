package com.project.software.urbanreports.occurrence;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Set;

/** Bounded ISO BMFF walk. External data references are rejected before native parsing. */
final class Mp4Structure {
    private final RandomAccessFile file;
    private int atoms;
    private boolean brand, movie, data;
    private static final Set<String> CONTAINERS = Set.of("moov", "trak", "mdia", "minf", "stbl", "dinf", "edts", "mvex", "moof", "traf");
    private Mp4Structure(RandomAccessFile file) { this.file = file; }
    static void validate(Path path) throws IOException {
        try (var file = new RandomAccessFile(path.toFile(), "r")) {
            var scan = new Mp4Structure(file);
            scan.walk(0, file.length(), 0);
            if (!scan.brand || !scan.movie || !scan.data) throw VideoException.invalid();
        }
    }
    private String type() throws IOException { byte[] b = new byte[4]; file.readFully(b); return new String(b, StandardCharsets.ISO_8859_1); }
    private void walk(long start, long end, int depth) throws IOException {
        if (depth > 16) throw VideoException.invalid();
        for (long pos = start; pos < end;) {
            if (++atoms > 10000 || end - pos < 8) throw VideoException.invalid();
            file.seek(pos); long size = Integer.toUnsignedLong(file.readInt()); String name = type(); long header = 8;
            if (size == 1) { size = file.readLong(); header = 16; }
            else if (size == 0) size = end - pos;
            if (size < header || size > end - pos) throw VideoException.invalid();
            long body = pos + header, limit = pos + size;
            if (Set.of("sinf", "senc", "pssh", "encv", "enca", "uuid").contains(name)) throw VideoException.invalid();
            if (name.equals("ftyp")) {
                if (depth != 0 || brand || size < 16 || size > 256) throw VideoException.invalid();
                String major = type();
                if (!Set.of("isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1").contains(major)) throw VideoException.invalid();
                brand = true;
            } else if (name.equals("moov")) { if (movie) throw VideoException.invalid(); movie = true; }
            else if (name.equals("mdat")) data = true;
            if (name.equals("dref")) {
                if (limit - body < 8) throw VideoException.invalid();
                file.seek(body); file.readInt(); int count = file.readInt();
                if (count != 1 || limit - file.getFilePointer() < 12) throw VideoException.invalid();
                long entrySize = Integer.toUnsignedLong(file.readInt()); String entry = type(); int flags = file.readInt();
                if (entrySize != 12 || !entry.equals("url ") || flags != 1 || file.getFilePointer() != limit) throw VideoException.invalid();
            }
            if (name.equals("stsd")) {
                file.seek(body); if (limit - body < 24) throw VideoException.invalid();
                file.readInt(); if (file.readInt() != 1) throw VideoException.invalid();
                long entryStart = file.getFilePointer(); long entrySize = Integer.toUnsignedLong(file.readInt()); String codec = type();
                if (entrySize != limit - entryStart || !Set.of("avc1", "avc3", "mp4a").contains(codec)) throw VideoException.invalid();
                file.skipBytes(6); if (file.readUnsignedShort() != 1) throw VideoException.invalid();
                long children = entryStart + (codec.equals("mp4a") ? 36 : 86);
                if (children > limit) throw VideoException.invalid();
                walk(children, limit, depth + 1);
            } else if (CONTAINERS.contains(name)) walk(body, limit, depth + 1);
            pos = limit;
        }
    }
}
