package com.project.software.urbanreports.administration;

import com.project.software.urbanreports.api.BoundedJsonInput;
import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/super-admin/admins")
public class AdminAccountsController {
    private final AdminProvisioningService service;
    private final BoundedJsonInput input;
    public AdminAccountsController(AdminProvisioningService service, BoundedJsonInput input) { this.service = service; this.input = input; }
    @GetMapping
    public ResponseEntity<AdminProvisioningService.AdminPage> list(@AuthenticationPrincipal AuthenticatedIdentity actor,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(actor, page, size));
    }
    @PostMapping
    public ResponseEntity<AdminProvisioningService.Invitation> create(@AuthenticationPrincipal AuthenticatedIdentity actor, HttpServletRequest request) throws Exception {
        var json = input.read(request, Set.of("name", "email"));
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service.create(actor, input.text(json, "name"), input.text(json, "email")));
    }
    @PostMapping("/{id}/activation-resends")
    public ResponseEntity<AdminProvisioningService.Invitation> resend(@AuthenticationPrincipal AuthenticatedIdentity actor, @PathVariable UUID id,
            HttpServletRequest request) throws Exception {
        input.read(request, Set.of());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.resend(actor, id));
    }
    @PostMapping("/{id}/deactivation")
    public ResponseEntity<AdminProvisioningService.Admin> deactivate(@AuthenticationPrincipal AuthenticatedIdentity actor, @PathVariable UUID id,
            HttpServletRequest request) throws Exception {
        input.read(request, Set.of());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.deactivate(actor, id));
    }
}
