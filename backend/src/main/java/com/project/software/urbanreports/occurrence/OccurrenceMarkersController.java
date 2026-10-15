package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OccurrenceMarkersController {
    private final OccurrenceMarkersService service;
    public OccurrenceMarkersController(OccurrenceMarkersService service) { this.service = service; }

    @GetMapping("/api/public/occurrences/markers")
    public ResponseEntity<MarkerSet> publicMarkers() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.read(null));
    }

    @GetMapping("/api/occurrences/markers")
    public ResponseEntity<MarkerSet> ownMarkers(@AuthenticationPrincipal AuthenticatedIdentity identity) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.read(identity.userId()));
    }

    public record Marker(UUID id, int categoryId, String categoryName, String title, OccurrenceStatus status,
            Double latitude, Double longitude) {}
    public record MarkerSet(List<Marker> items, int total, int located, int unlocated) {}
}
