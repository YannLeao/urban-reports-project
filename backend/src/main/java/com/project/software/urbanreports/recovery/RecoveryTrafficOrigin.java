package com.project.software.urbanreports.recovery;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.web.util.matcher.IpAddressMatcher;
import org.springframework.stereotype.Component;

/** Socket peer by default. Only explicit proxy CIDRs may supply a forwarded chain. */
@Component
public final class RecoveryTrafficOrigin {
    private final List<IpAddressMatcher> proxies;
    public RecoveryTrafficOrigin(@Value("${recovery.trusted-proxies:}") String proxies) {
        try {
            this.proxies = proxies.isBlank() ? List.of() : Arrays.stream(proxies.split(",", -1))
                    .map(String::trim).map(value -> {
                        if (numeric(value.split("/", -1)[0]) == null) throw new IllegalArgumentException();
                        return new IpAddressMatcher(value);
                    }).toList();
            if (this.proxies.size() > 32) throw new IllegalArgumentException();
        } catch (RuntimeException invalid) { throw new IllegalArgumentException("Invalid recovery trusted proxy configuration"); }
    }
    public String resolve(HttpServletRequest request) {
        String peer = numeric(request.getRemoteAddr());
        if (peer == null) return "unresolved";
        if (!trusted(peer)) return peer;
        var parts = new ArrayList<String>();
        int length = 0;
        for (var headers = request.getHeaders("X-Forwarded-For"); headers.hasMoreElements();) {
            String header = headers.nextElement(); length += header.length();
            if (length > 4096) return peer;
            parts.addAll(Arrays.asList(header.split(",", -1)));
            if (parts.size() > 32) return peer;
        }
        String candidate = peer;
        for (int i = parts.size() - 1; i >= 0 && trusted(candidate); i--) {
            String next = numeric(parts.get(i).trim());
            if (next == null) return peer;
            candidate = next;
        }
        return candidate;
    }
    private boolean trusted(String address) { return proxies.stream().anyMatch(proxy -> proxy.matches(address)); }
    private static String numeric(String value) {
        try {
            if (value == null || value.length() > 45 || value.contains("%")
                    || !(value.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}") || value.contains(":") && value.matches("[0-9a-fA-F:.]+"))) return null;
            return InetAddress.getByName(value).getHostAddress();
        } catch (Exception invalid) { return null; }
    }
}
