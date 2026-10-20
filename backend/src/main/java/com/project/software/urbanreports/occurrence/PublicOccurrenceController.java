package com.project.software.urbanreports.occurrence;

import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/occurrences")
public class PublicOccurrenceController {
    private final PublicOccurrenceService service;

    public PublicOccurrenceController(PublicOccurrenceService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<PublicOccurrencePage> list(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<PublicOccurrenceResponse> detail(@PathVariable UUID id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.find(id));
    }

    @GetMapping("/{id}/image")
    public ResponseEntity<byte[]> image(@PathVariable UUID id) {
        var image = service.image(id);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(image.contentType())).body(image.content());
    }
}