package com.project.software.urbanreports.identity;

public final class PasswordPolicy {
    private PasswordPolicy() {}
    public static boolean valid(String value) {
        return value != null && value.length() <= 256 && value.codePointCount(0, value.length()) >= 15
                && value.codePointCount(0, value.length()) <= 128
                && value.codePoints().noneMatch(c -> c >= 0xD800 && c <= 0xDFFF);
    }
}
