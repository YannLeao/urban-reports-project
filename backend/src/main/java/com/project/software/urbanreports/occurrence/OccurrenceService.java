package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.storage.application.ImageStorageException;
import com.project.software.urbanreports.storage.application.ImageStorageService;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class OccurrenceService {
    private final OccurrenceRepository occurrences;
    private final OccurrenceCategoryRepository categories;
    private final ImageStorageService images;
    private final Clock clock;

    public OccurrenceService(OccurrenceRepository occurrences, OccurrenceCategoryRepository categories,
            ImageStorageService images, Clock clock) {
        this.occurrences = occurrences;
        this.categories = categories;
        this.images = images;
        this.clock = clock;
    }

    @Transactional
    public OccurrenceResponse create(UUID authorId, OccurrenceRequest request, MultipartFile image) {
        Map<String, List<String>> fields = validate(request, image);
        if (!fields.isEmpty()) throw new OccurrenceValidationException(fields);
        OccurrenceCategory category = categories.findById(request.categoryId())
                .orElseThrow(() -> new OccurrenceValidationException(Map.of("categoryId", List.of("Choose a valid category"))));

        String imageKey = images.storeForOccurrence(image);
        try {
            Occurrence occurrence = new Occurrence(authorId, category, clean(request.title()), clean(request.description()),
                    clean(request.neighborhood()), clean(request.reference()), imageKey, clock.instant());
            return OccurrenceResponse.from(occurrences.saveAndFlush(occurrence));
        } catch (RuntimeException exception) {
            try { images.delete(imageKey); } catch (ImageStorageException cleanupFailure) { exception.addSuppressed(cleanupFailure); }
            throw exception;
        }
    }

    private Map<String, List<String>> validate(OccurrenceRequest request, MultipartFile image) {
        Map<String, List<String>> fields = new LinkedHashMap<>();
        if (request == null || request.categoryId() == null) fields.put("categoryId", List.of("Category is required"));
        if (request == null || !length(request.title(), 5, 100)) fields.put("title", List.of("Title must have 5 to 100 characters"));
        if (request == null || !length(request.description(), 20, 1000)) fields.put("description", List.of("Description must have 20 to 1000 characters"));
        if (request == null || !length(request.neighborhood(), 2, 100)) fields.put("neighborhood", List.of("Neighborhood must have 2 to 100 characters"));
        if (request == null || !length(request.reference(), 5, 200)) fields.put("reference", List.of("Reference must have 5 to 200 characters"));
        if (image == null || image.isEmpty()) fields.put("image", List.of("Exactly one JPEG, PNG or WebP image is required"));
        return fields;
    }

    private static boolean length(String value, int min, int max) {
        if (value == null) return false;
        int length = value.trim().length();
        return length >= min && length <= max;
    }

    private static String clean(String value) { return value.trim(); }
}
