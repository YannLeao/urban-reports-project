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
    private final com.project.software.urbanreports.administration.AccountAccess access;
    private final OccurrenceRepository occurrences;
    private final OccurrenceCategoryRepository categories;
    private final ImageStorageService images;
    private final Clock clock;
    private final UploadJournal journal;
    private final OccurrenceHistoryRepository history;
    private final VideoValidator videos;
    private final com.project.software.urbanreports.identity.UserAccountRepository accounts;

    public OccurrenceService(OccurrenceRepository occurrences, OccurrenceCategoryRepository categories,
            ImageStorageService images, Clock clock, UploadJournal journal, OccurrenceHistoryRepository history,
            com.project.software.urbanreports.identity.UserAccountRepository accounts,
            com.project.software.urbanreports.administration.AccountAccess access, VideoValidator videos) {
        this.videos = videos;
        this.access = access;
        this.occurrences = occurrences;
        this.categories = categories;
        this.images = images;
        this.clock = clock;
        this.journal = journal;
        this.history = history;
        this.accounts = accounts;
    }

    public OccurrenceResponse create(UUID authorId, OccurrenceRequest request, MultipartFile image) {
        return createPhotos(authorId, request, image == null ? List.of() : List.of(image));
    }

    public OccurrenceResponse createPhotos(com.project.software.urbanreports.auth.AuthenticatedIdentity actor,
            OccurrenceRequest request, List<MultipartFile> files) {
        return createPhotos(actor.userId(), request, files, actor, false);
    }
    public OccurrenceResponse createPhotos(UUID authorId, OccurrenceRequest request, List<MultipartFile> files) {
        return createPhotos(authorId, request, files, null, false);
    }
    private OccurrenceResponse createPhotos(UUID authorId, OccurrenceRequest request, List<MultipartFile> files,
            com.project.software.urbanreports.auth.AuthenticatedIdentity actor, boolean video) {
        accounts.findById(authorId).filter(account -> account.isActive()
                && account.getRole() == com.project.software.urbanreports.identity.AccountRole.USER)
                .orElseThrow(() -> new org.springframework.security.access.AccessDeniedException("Access denied"));
        var fields = validate(request, null); fields.remove("image");
        var point = GeographicPoint.parse(request.latitude(), request.longitude(), true);
        if (!fields.isEmpty()) throw new OccurrenceValidationException(fields);
        var category = categories.findById(request.categoryId()).orElseThrow(() ->
                new OccurrenceValidationException(Map.of("categoryId", List.of("Choose a valid category"))));
        try (var batch = prepare(files, video)) {
        var prepared = batch.uploads();
        for (var upload : prepared) journal.record(upload.key());
        return journal.link(prepared.stream().map(Upload::key).toList(), () -> authorize(actor), () -> {
            for (var upload : prepared) upload(upload);
            var occurrence = new Occurrence(authorId, category, clean(request.title()), description(request.description()),
                    clean(request.neighborhood()), clean(request.reference()), null, clock.instant());
            occurrence.locate(point);
            occurrence.replaceMedia(prepared.stream().map(upload -> upload.media(occurrence)).toList());
            return OccurrenceResponse.from(occurrences.saveAndFlush(occurrence));
        });
        }
    }
    public OccurrenceResponse createPhotos(com.project.software.urbanreports.auth.AuthenticatedIdentity actor,
            OccurrenceRequest request, List<MultipartFile> files, boolean video) {
        return createPhotos(actor.userId(), request, files, actor, video);
    }

    // Validate sequentially; retain multipart handles and metadata, never five byte arrays/pixel buffers.
    private record Upload(String key, String contentType, MultipartFile file, VideoValidator.Prepared video) {
        OccurrenceMedia media(Occurrence report) {
            return video == null ? new OccurrenceMedia(report, key, contentType, file.getSize(), 0)
                    : new OccurrenceMedia(report, key, video.size(), video.metadata());
        }
    }
    private record Batch(List<Upload> uploads) implements AutoCloseable {
        public void close() { for (var upload : uploads) if (upload.video() != null) upload.video().close(); }
    }
    private Batch prepare(List<MultipartFile> files, boolean video) {
        if (files.isEmpty() || files.size() > 5) throw MediaManifest.invalid();
        var uploads = new java.util.ArrayList<Upload>();
        if (video) {
            if (files.size() != 1) throw MediaManifest.invalid();
            images.checkAvailable();
            var prepared = videos.prepare(files.getFirst());
            return new Batch(List.of(new Upload("occurrences/" + UUID.randomUUID() + ".mp4", "video/mp4", null, prepared)));
        }
        for (var file : files) {
            if (file.getSize() > 5242880) throw new OccurrenceWriteException(org.springframework.http.HttpStatus.CONTENT_TOO_LARGE, "IMAGE_TOO_LARGE");
            var validated = images.prepareOccurrence(file);
            uploads.add(new Upload(validated.key(), validated.contentType(), file, null));
        }
        return new Batch(uploads);
    }
    private void upload(Upload upload) {
        if (upload.video() == null) images.uploadAt(upload.key(), upload.contentType(), upload.file());
        else {
            images.uploadStream(upload.key(), upload.video().size(), "video/mp4", () -> {
                try { return upload.video().open(); }
                catch (java.io.IOException failure) { throw VideoException.unavailable(); }
            });
        }
    }

    @Transactional(readOnly = true)
    public List<OccurrenceResponse> findByAuthorId(UUID authorId) {
        Sort sort = Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
        return occurrences.findByAuthorId(authorId, sort).stream().map(OccurrenceResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public OccurrenceResponse findById(UUID authorId, UUID occurrenceId) {
        return occurrences.findByIdAndAuthorId(occurrenceId, authorId)
                .map(occurrence -> OccurrenceResponse.from(occurrence,
                        history.findByOccurrenceIdOrderByOccurredAtAscVersionAsc(occurrenceId).stream()
                                .map(OccurrenceHistory::authorEvent).toList()))
                .orElseThrow(() -> new OccurrenceNotFoundException(occurrenceId));
    }

    private Map<String, List<String>> validate(OccurrenceRequest request, MultipartFile image) {
        Map<String, List<String>> fields = new LinkedHashMap<>();
        if (request == null || request.categoryId() == null) fields.put("categoryId", List.of("Category is required"));
        if (request == null || !length(request.title(), 5, 100)) fields.put("title", List.of("Title must have 5 to 100 characters"));
        if (request == null || request.description() != null && !length(request.description(), 0, 1000)) fields.put("description", List.of("Description must have at most 1000 characters"));
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

    private static String description(String value) { return value == null || clean(value).isEmpty() ? null : clean(value); }

    public com.project.software.urbanreports.storage.application.StoredImageContent image(UUID authorId, UUID id) {
        return media(authorId, id, null);
    }
    public com.project.software.urbanreports.storage.application.StoredImageContent media(UUID authorId, UUID id, UUID mediaId) {
        String key = journal.write(() -> {
            var report = occurrences.findByIdAndAuthorId(id, authorId).orElseThrow(() -> new OccurrenceNotFoundException(id));
            return mediaId == null ? report.getImageKey() : report.mediaKey(mediaId);
        });
        return images.loadOccurrence(key);
    }

    static void checkWritable(OccurrenceStatus state, long version, String match) {
        if (state != OccurrenceStatus.PENDING) throw new OccurrenceWriteException(org.springframework.http.HttpStatus.CONFLICT, "OCCURRENCE_NOT_EDITABLE");
        if (match == null) throw new OccurrenceWriteException(org.springframework.http.HttpStatus.PRECONDITION_REQUIRED, "VERSION_REQUIRED");
        if (!match.equals("\"" + version + "\"")) throw new OccurrenceWriteException(org.springframework.http.HttpStatus.PRECONDITION_FAILED, "VERSION_CHANGED");
    }

    public OccurrenceResponse update(UUID authorId, UUID id, String match, OccurrenceRequest request, MultipartFile image) {
        return updatePhotos(authorId, id, match, request, image == null ? List.of() : List.of(image), null, image != null);
    }

    public OccurrenceResponse updatePhotos(com.project.software.urbanreports.auth.AuthenticatedIdentity actor,
            UUID id, String match, OccurrenceRequest request, List<MultipartFile> files, MediaManifest manifest, boolean legacy) {
        return updatePhotos(actor.userId(), id, match, request, files, manifest, legacy, actor, false);
    }
    public OccurrenceResponse updatePhotos(UUID authorId, UUID id, String match, OccurrenceRequest request,
            List<MultipartFile> files, MediaManifest manifest, boolean legacy) {
        return updatePhotos(authorId, id, match, request, files, manifest, legacy, null, false);
    }
    public OccurrenceResponse updatePhotos(com.project.software.urbanreports.auth.AuthenticatedIdentity actor,
            UUID id, String match, OccurrenceRequest request, List<MultipartFile> files, MediaManifest manifest, boolean legacy, boolean video) {
        return updatePhotos(actor.userId(), id, match, request, files, manifest, legacy, actor, video);
    }
    private OccurrenceResponse updatePhotos(UUID authorId, UUID id, String match, OccurrenceRequest request,
            List<MultipartFile> files, MediaManifest manifest, boolean legacy,
            com.project.software.urbanreports.auth.AuthenticatedIdentity actor, boolean video) {
        var snapshot = journal.write(() -> {
            // Keep entity and collection in one short, locked snapshot. A concurrent delete
            // must produce 404, rather than a transient empty collection/manifest error.
            authorize(actor);
            var occurrence = occurrences.lockOwned(id, authorId).orElseThrow(() -> new OccurrenceNotFoundException(id));
            return OccurrenceResponse.from(occurrence);
        });
        checkWritable(snapshot.status(), snapshot.version(), match);
        var fields = validate(request, null); fields.remove("image");
        var point = GeographicPoint.parse(request.latitude(), request.longitude(), false);
        if (!fields.isEmpty()) throw new OccurrenceValidationException(fields);
        var category = categories.findById(request.categoryId()).orElseThrow(() ->
                new OccurrenceValidationException(Map.of("categoryId", List.of("Choose a valid category"))));
        if (legacy) {
            if (snapshot.media().size() != 1 || !snapshot.media().getFirst().type().equals("IMAGE") || files.size() != 1 || manifest != null) throw MediaManifest.invalid();
            manifest = new MediaManifest(List.of(new MediaManifest.Item(null, 0)));
        }
        if (manifest == null && !files.isEmpty()) throw MediaManifest.invalid();
        if (manifest != null) manifest.validate(snapshot.media().stream().map(OccurrenceMedia.Response::id).toList(), files.size());
        final var finalManifest = manifest;
        if (manifest != null) {
            var kinds = new java.util.HashSet<String>();
            for (var item : manifest.items()) kinds.add(item.id() == null ? video ? "VIDEO" : "IMAGE"
                : snapshot.media().stream().filter(m -> m.id().equals(item.id())).findFirst().orElseThrow(MediaManifest::invalid).type());
            if (kinds.size() != 1 || kinds.contains("VIDEO") && manifest.items().size() != 1) throw MediaManifest.invalid();
        }
        try (var batch = files.isEmpty() ? new Batch(List.of()) : prepare(files, video)) {
        var prepared = batch.uploads();
        for (var upload : prepared) journal.record(upload.key());
        // Globally sorted new journal keys -> occurrence; existing keys are retired only under occurrence lock.
        // Recovery never locks occurrences and only performs a nonlocking reference check.
        return journal.link(prepared.stream().map(Upload::key).toList(), () -> authorize(actor), () -> {
            for (var upload : prepared) upload(upload);
            var occurrence = occurrences.lockOwned(id, authorId).orElseThrow(() -> new OccurrenceNotFoundException(id));
            checkWritable(occurrence.getStatus(), occurrence.getVersion(), match);
            occurrence.locate(point);
            if (finalManifest != null) {
                finalManifest.validate(occurrence.getMedia().stream().map(OccurrenceMedia::getId).toList(), prepared.size());
                var byId = occurrence.getMedia().stream().collect(java.util.stream.Collectors.toMap(OccurrenceMedia::getId, item -> item));
                var selected = finalManifest.items().stream().map(item -> {
                    if (item.id() != null) return byId.get(item.id());
                    var upload = prepared.get(item.uploadIndex());
                    return upload.media(occurrence);
                }).toList();
                occurrence.getMedia().stream().filter(item -> !selected.contains(item))
                        .sorted(java.util.Comparator.comparing(OccurrenceMedia::getObjectKey))
                        .forEach(item -> journal.retire(item.getObjectKey()));
                occurrence.replaceMedia(selected);
            }
            occurrence.update(category, clean(request.title()), description(request.description()),
                    clean(request.neighborhood()), clean(request.reference()));
            return OccurrenceResponse.from(occurrences.saveAndFlush(occurrence));
        });
        }
    }

    private void authorize(com.project.software.urbanreports.auth.AuthenticatedIdentity actor) {
        if (actor != null) access.lock(actor, com.project.software.urbanreports.identity.AccountRole.USER);
    }
    public void delete(com.project.software.urbanreports.auth.AuthenticatedIdentity actor, UUID id, String match) {
        delete(actor.userId(), id, match, actor);
    }
    public void delete(UUID authorId, UUID id, String match) { delete(authorId, id, match, null); }
    private void delete(UUID authorId, UUID id, String match, com.project.software.urbanreports.auth.AuthenticatedIdentity actor) {
        journal.write(() -> {
            authorize(actor);
            var occurrence = occurrences.lockOwned(id, authorId).orElseThrow(() -> new OccurrenceNotFoundException(id));
            checkWritable(occurrence.getStatus(), occurrence.getVersion(), match);
            occurrence.getMedia().stream().map(OccurrenceMedia::getObjectKey).sorted().forEach(journal::retire);
            occurrences.delete(occurrence); occurrences.flush();
            return null;
        });
    }

    private static String clean(String value) { return com.project.software.urbanreports.identity.RegistrationValidation.trim(value); }
}
