package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.api.BoundedJsonInput;
import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/occurrences")
public class ModerationController {
    private final ModerationService service;
    private final BoundedJsonInput input;
    public ModerationController(ModerationService service, BoundedJsonInput input) { this.service = service; this.input = input; }
    @GetMapping
    public ResponseEntity<ModerationService.Queue> list(@AuthenticationPrincipal AuthenticatedIdentity actor,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(actor, page, size));
    }
    @GetMapping("/{id}")
    public ResponseEntity<ModerationService.Detail> find(@AuthenticationPrincipal AuthenticatedIdentity actor, @PathVariable UUID id) {
        return response(service.find(actor, id));
    }
    @GetMapping("/{id}/image")
    public ResponseEntity<byte[]> image(@AuthenticationPrincipal AuthenticatedIdentity actor, @PathVariable UUID id) {
        var image = service.image(actor, id);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(image.contentType())).body(image.content());
    }
    @PostMapping("/{id}/transitions")
    public ResponseEntity<ModerationService.Detail> transition(@AuthenticationPrincipal AuthenticatedIdentity actor, @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String match, HttpServletRequest request) throws Exception {
        var json = input.read(request, Set.of("target", "reason"));
        String target = input.text(json, "target");
        return response(service.transition(actor, id, match, new OccurrenceTransition(
                target == null ? null : OccurrenceStatus.valueOf(target), input.text(json, "reason"))));
    }
    private ResponseEntity<ModerationService.Detail> response(ModerationService.Detail detail) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).eTag("\"" + detail.report().version() + "\"").body(detail);
    }
}
