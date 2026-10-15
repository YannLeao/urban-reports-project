package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.storage.application.ImageStorageService;
import com.project.software.urbanreports.storage.application.StoredImageContent;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PublicOccurrenceService {
    static final int MAX_SIZE = 50;
    private final OccurrenceRepository occurrences;
    private final ImageStorageService images;

    public PublicOccurrenceService(OccurrenceRepository occurrences, ImageStorageService images) {
        this.occurrences = occurrences;
        this.images = images;
    }

    @Transactional(readOnly = true)
    public PublicOccurrencePage list(int page, int size) {
        Map<String, List<String>> fields = new LinkedHashMap<>();
        if (page < 0) fields.put("page", List.of("Page must be zero or greater"));
        if (size < 1 || size > MAX_SIZE) fields.put("size", List.of("Size must be between 1 and " + MAX_SIZE));
        if (!fields.isEmpty()) throw new OccurrenceValidationException(fields);
        var sort = Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
        var result = occurrences.findByStatusNot(OccurrenceStatus.REJECTED, PageRequest.of(page, size, sort));
        return new PublicOccurrencePage(
                result.getContent().stream().map(PublicOccurrenceResponse::from).toList(),
                result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public PublicOccurrenceResponse find(UUID id) {
        return occurrences.findByIdAndStatusNot(id, OccurrenceStatus.REJECTED).map(PublicOccurrenceResponse::from)
                .orElseThrow(() -> new OccurrenceNotFoundException(id));
    }

    public StoredImageContent image(UUID id) {
        String key = occurrences.findByIdAndStatusNot(id, OccurrenceStatus.REJECTED)
                .orElseThrow(() -> new OccurrenceNotFoundException(id)).getImageKey();
        return images.loadOccurrence(key);
    }
}
