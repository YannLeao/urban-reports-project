package com.project.software.urbanreports.notification;

import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    private final NotificationService service;

    public NotificationController(NotificationService service) { this.service = service; }

    @GetMapping
    ResponseEntity<NotificationService.PageResponse> list(
            @AuthenticationPrincipal AuthenticatedIdentity identity,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(identity, page, size));
    }

    @PostMapping("/{id}/read")
    ResponseEntity<NotificationService.NotificationResponse> markRead(
            @AuthenticationPrincipal AuthenticatedIdentity identity, @PathVariable UUID id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.markRead(identity, id));
    }
}
