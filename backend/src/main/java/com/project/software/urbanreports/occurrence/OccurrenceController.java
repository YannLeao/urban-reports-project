package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.data.domain.Sort;

@RestController
@RequestMapping("/api")
public class OccurrenceController {
    private final OccurrenceCategoryRepository categories;
    private final OccurrenceService service;

    public OccurrenceController(OccurrenceCategoryRepository categories, OccurrenceService service) {
        this.categories = categories;
        this.service = service;
    }

    @GetMapping("/occurrence-categories")
    public List<OccurrenceCategoryResponse> categories() {
        return categories.findAll(Sort.by(Sort.Direction.ASC, "id")).stream()
            .map(category -> new OccurrenceCategoryResponse(category.getId(), category.getName())).toList();
    }

    @GetMapping("/occurrences")
    public ResponseEntity<List<OccurrenceResponse>> mine(@AuthenticationPrincipal AuthenticatedIdentity identity) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.findByAuthorId(identity.userId()));
    }

    @GetMapping("/occurrences/{id}")
    public ResponseEntity<OccurrenceResponse> detail(@AuthenticationPrincipal AuthenticatedIdentity identity,
            @PathVariable UUID id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.findById(identity.userId(), id));
    }

    @PostMapping(path = "/occurrences", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<OccurrenceResponse> create(@AuthenticationPrincipal AuthenticatedIdentity identity,
            @RequestParam Integer categoryId, @RequestParam String title, @RequestParam(required = false) String description,
            @RequestParam String neighborhood, @RequestParam String reference,
            @RequestPart("image") MultipartFile image, HttpServletRequest request) throws Exception {
        validateParts(request, true);
        OccurrenceResponse response = service.create(identity.userId(),
                new OccurrenceRequest(categoryId, title, description, neighborhood, reference), image);
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(response);
    }

    private void validateParts(HttpServletRequest request, boolean creating) throws Exception {
        var parts = request.getParts();
        var required = java.util.Set.of("categoryId", "title", "neighborhood", "reference");
        for (String name : required) {
            if (parts.stream().filter(part -> name.equals(part.getName())).count() != 1) {
                throw new OccurrenceValidationException(java.util.Map.of(name, List.of("Envie exatamente uma parte por campo obrigatório.")));
            }
        }
        for (String name : java.util.List.of("description", "image")) {
            long count = parts.stream().filter(part -> name.equals(part.getName())).count();
            if (count > 1 || (creating && name.equals("image") && count != 1))
                throw new OccurrenceValidationException(java.util.Map.of(name, List.of("Envie uma única parte por campo.")));
        }
        for (var part : parts) {
            boolean file = part.getSubmittedFileName() != null;
            if ((file && !"image".equals(part.getName())) || ("image".equals(part.getName()) && !file)) {
                throw new OccurrenceValidationException(java.util.Map.of("image", List.of("Envie somente um arquivo, no campo image.")));
            }
        }
    }

    @GetMapping("/occurrences/{id}/image")
    public ResponseEntity<byte[]> image(@AuthenticationPrincipal AuthenticatedIdentity identity, @PathVariable UUID id) {
        var image = service.image(identity.userId(), id);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(image.contentType())).body(image.content());
    }

    @org.springframework.web.bind.annotation.PutMapping(path = "/occurrences/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<OccurrenceResponse> update(@AuthenticationPrincipal AuthenticatedIdentity identity,
            @PathVariable UUID id, @org.springframework.web.bind.annotation.RequestHeader(value = "If-Match", required = false) String match,
            @RequestParam Integer categoryId, @RequestParam String title, @RequestParam(required = false) String description,
            @RequestParam String neighborhood, @RequestParam String reference,
            @RequestPart(value = "image", required = false) MultipartFile image, HttpServletRequest request) throws Exception {
        validateParts(request, false);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.update(identity.userId(), id, match,
                new OccurrenceRequest(categoryId, title, description, neighborhood, reference), image));
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/occurrences/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthenticatedIdentity identity, @PathVariable UUID id,
            @org.springframework.web.bind.annotation.RequestHeader(value = "If-Match", required = false) String match) {
        service.delete(identity.userId(), id, match);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    public record OccurrenceCategoryResponse(Integer id, String name) {}
}
