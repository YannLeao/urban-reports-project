package com.project.software.urbanreports.administration;

import com.project.software.urbanreports.api.BoundedJsonInput;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class AdminActivationController {
    private final AdminProvisioningService service;
    private final BoundedJsonInput input;
    public AdminActivationController(AdminProvisioningService service, BoundedJsonInput input) { this.service = service; this.input = input; }
    @PostMapping("/api/auth/admin-activations")
    public ResponseEntity<Map<String, Boolean>> activate(HttpServletRequest request) throws Exception {
        var json = input.read(request, Set.of("token", "password"));
        service.activate(input.text(json, "token"), input.text(json, "password"));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("activated", true));
    }
}
