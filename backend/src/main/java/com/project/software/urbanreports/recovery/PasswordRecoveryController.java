package com.project.software.urbanreports.recovery;

import com.project.software.urbanreports.api.BoundedJsonInput;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class PasswordRecoveryController {
    private final PasswordRecoveryService service;
    private final BoundedJsonInput input;
    private final RecoveryTrafficOrigin traffic;

    public PasswordRecoveryController(PasswordRecoveryService service, BoundedJsonInput input, RecoveryTrafficOrigin traffic) {
        this.service = service; this.input = input; this.traffic = traffic;
    }

    @PostMapping("/api/auth/password-recovery-requests")
    public ResponseEntity<Map<String, Boolean>> request(HttpServletRequest request) throws Exception {
        var json = input.read(request, Set.of("email"));
        service.request(input.text(json, "email"), traffic.resolve(request));
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore()).body(Map.of("requested", true));
    }

    @PostMapping("/api/auth/password-resets")
    public ResponseEntity<Map<String, Boolean>> reset(HttpServletRequest request) throws Exception {
        service.checkResetLimit(traffic.resolve(request));
        var json = input.read(request, Set.of("token", "password"));
        service.reset(input.text(json, "token"), input.text(json, "password"));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("reset", true));
    }
}