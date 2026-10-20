package com.project.software.urbanreports.occurrence;

import java.math.BigInteger;

/** null means ignore header; unsatisfiable is distinct from malformed. */
record ByteRange(long start, long end) {
    long length() { return end - start + 1; }
    static ByteRange parse(String value, long size) {
        if (value == null || value.length() > 128 || !value.matches("(?i:bytes)=[0-9]*-[0-9]*") || value.equalsIgnoreCase("bytes=-")) return null;
        String[] parts = value.substring(6).split("-", -1);
        BigInteger total = BigInteger.valueOf(size);
        if (parts[0].isEmpty()) {
            BigInteger suffix = new BigInteger(parts[1]);
            return suffix.signum() == 0 ? new ByteRange(-1, -1) : new ByteRange(total.subtract(suffix.min(total)).longValueExact(), size - 1);
        }
        BigInteger start = new BigInteger(parts[0]);
        BigInteger end = parts[1].isEmpty() ? total.subtract(BigInteger.ONE) : new BigInteger(parts[1]);
        if (start.compareTo(end) > 0 && !parts[1].isEmpty()) return null;
        if (start.compareTo(total) >= 0) return new ByteRange(-1, -1);
        return new ByteRange(start.longValueExact(), end.min(total.subtract(BigInteger.ONE)).longValueExact());
    }
}
