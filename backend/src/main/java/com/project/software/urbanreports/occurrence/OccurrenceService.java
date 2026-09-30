package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.storage.application.UploadJournal;
import com.project.software.urbanreports.storage.application.ImageStorageService;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class OccurrenceService {
    private final OccurrenceRepository occurrences;
    private final OccurrenceCategoryRepository categories;
    private final ImageStorageService images;
    private final Clock clock;
    private final UploadJournal journal;

    public OccurrenceService(OccurrenceRepository occurrences, OccurrenceCategoryRepository categories,
            ImageStorageService images, Clock clock, UploadJournal journal) {
        this.occurrences = occurrences;
        this.categories = categories;
        this.images = images;
        this.clock = clock;
        this.journal = journal;
    }

    public OccurrenceResponse create(UUID authorId, OccurrenceRequest request, MultipartFile image) {
        Map<String, List<String>> fields = validate(request, image);
        if (!fields.isEmpty()) throw new OccurrenceValidationException(fields);
        OccurrenceCategory category = categories.findById(request.categoryId())
                .orElseThrow(() -> new OccurrenceValidationException(Map.of("categoryId", List.of("Choose a valid category"))));

        var prepared = images.prepareOccurrence(image);
        journal.record(prepared.key());
        return journal.link(prepared.key(), () -> {
            images.upload(prepared);
            Occurrence occurrence = new Occurrence(authorId, category, clean(request.title()), clean(request.description()),
                    clean(request.neighborhood()), clean(request.reference()), prepared.key(), clock.instant());
            return OccurrenceResponse.from(occurrences.saveAndFlush(occurrence));
        });
    }

    @Transactional(readOnly = true)
    public List<OccurrenceResponse> findByAuthorId(UUID authorId) {
        Sort sort = Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
        return occurrences.findByAuthorId(authorId, sort).stream().map(OccurrenceResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public OccurrenceResponse findById(UUID authorId, UUID occurrenceId) {
        return occurrences.findByIdAndAuthorId(occurrenceId, authorId)
                .map(OccurrenceResponse::from)
                .orElseThrow(() -> new OccurrenceNotFoundException(occurrenceId));
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
        String cleaned = clean(value);
        if (cleaned.codePoints().anyMatch(c -> c == 0 || c >= 0xD800 && c <= 0xDFFF)) return false;
        int length = cleaned.codePointCount(0, cleaned.length());
        return length >= min && length <= max;
    }

    private static String clean(String value) { return com.project.software.urbanreports.identity.RegistrationValidation.trim(value); }
}
