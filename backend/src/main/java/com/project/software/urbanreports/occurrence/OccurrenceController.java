package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
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

    @PostMapping(path = "/occurrences", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<OccurrenceResponse> create(@AuthenticationPrincipal AuthenticatedIdentity identity,
            @RequestParam Integer categoryId, @RequestParam String title, @RequestParam String description,
            @RequestParam String neighborhood, @RequestParam String reference,
            @RequestPart("image") MultipartFile image, HttpServletRequest request) throws Exception {
        long fileCount = request.getParts().stream()
                .filter(part -> part.getSubmittedFileName() != null && !part.getSubmittedFileName().isBlank()).count();
        if (fileCount != 1) throw new OccurrenceValidationException(java.util.Map.of("image", List.of("Exactly one image is required")));
        OccurrenceResponse response = service.create(identity.userId(),
                new OccurrenceRequest(categoryId, title, description, neighborhood, reference), image);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}")
                .buildAndExpand(response.id()).toUri();
        return ResponseEntity.created(location).body(response);
    }

    public record OccurrenceCategoryResponse(Integer id, String name) {}
}
