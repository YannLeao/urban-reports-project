package com.project.software.urbanreports.identity;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

public final class RegistrationValidation {
    private RegistrationValidation() {}
    private static final Pattern EMAIL = Pattern.compile(
            "[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@"
            + "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+");

    // Explicit shared trim set: ASCII whitespace U+0009..000D and U+0020.
    public static String trim(String value) {
        return value == null ? "" : value.replaceAll("^[\\x09-\\x0D\\x20]+|[\\x09-\\x0D\\x20]+$", "");
    }
    public static String canonicalEmail(String value) { return trim(value).toLowerCase(Locale.ROOT); }
    public static boolean validName(String raw) {
        String name = trim(raw);
        int length = name.codePointCount(0, name.length());
        return length >= 2 && length <= 100 && name.codePoints().noneMatch(c ->
                Character.isISOControl(c) || c == 0x2028 || c == 0x2029 || c >= 0xD800 && c <= 0xDFFF);
    }

    public static boolean validEmail(String value) {
        String raw = trim(value), email = canonicalEmail(value);
        return raw.chars().noneMatch(c -> c > 127) && email.length() <= 254
                && email.indexOf('@') <= 64 && EMAIL.matcher(email).matches();
    }

    static RegistrationRequest validate(RegistrationRequest request) {
        String name = trim(request.name());
        String email = canonicalEmail(request.email());
        String password = request.password();
        Map<String, List<String>> errors = new LinkedHashMap<>();
        if (!validName(name)) {
            errors.put("name", List.of("INVALID_NAME"));
        }
        if (!validEmail(request.email())) {
            errors.put("email", List.of("INVALID_EMAIL"));
        }
        if (!PasswordPolicy.valid(password)) {
            errors.put("password", List.of("INVALID_PASSWORD"));
        }
        if (!errors.isEmpty()) throw new RegistrationValidationException(errors);
        return new RegistrationRequest(name, email, password);
    }
}
