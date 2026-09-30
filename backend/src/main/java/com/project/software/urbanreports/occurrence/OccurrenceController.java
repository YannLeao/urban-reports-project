package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
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

    @PostMapping(path = "/occurrences", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<OccurrenceResponse> create(@AuthenticationPrincipal AuthenticatedIdentity identity,
            @RequestParam Integer categoryId, @RequestParam String title, @RequestParam String description,
            @RequestParam String neighborhood, @RequestParam String reference,
            @RequestPart("image") MultipartFile image, HttpServletRequest request) throws Exception {
        var parts = request.getParts();
        var required = java.util.Set.of("categoryId", "title", "description", "neighborhood", "reference", "image");
        for (String name : required) {
            if (parts.stream().filter(part -> name.equals(part.getName())).count() != 1) {
                throw new OccurrenceValidationException(java.util.Map.of(name, List.of("Envie exatamente uma parte por campo obrigatório.")));
            }
        }
        for (var part : parts) {
            boolean file = part.getSubmittedFileName() != null;
            if ((file && !"image".equals(part.getName())) || ("image".equals(part.getName()) && !file)) {
                throw new OccurrenceValidationException(java.util.Map.of("image", List.of("Envie somente um arquivo, no campo image.")));
            }
        }
        OccurrenceResponse response = service.create(identity.userId(),
                new OccurrenceRequest(categoryId, title, description, neighborhood, reference), image);
        return ResponseEntity.status(201).body(response);
    }

    public record OccurrenceCategoryResponse(Integer id, String name) {}
}
