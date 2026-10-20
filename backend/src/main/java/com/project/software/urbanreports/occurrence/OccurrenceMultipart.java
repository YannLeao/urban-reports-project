package com.project.software.urbanreports.occurrence;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.web.multipart.MultipartFile;

record OccurrenceMultipart(List<MultipartFile> images, MediaManifest manifest, boolean legacy, boolean video) {
    static OccurrenceMultipart read(HttpServletRequest request, List<MultipartFile> images, MultipartFile image, boolean creating, MultipartFile video) throws Exception {
        var parts = request.getParts();
        if (parts.size() > 20) throw MediaManifest.invalid();
        var required = Set.of("categoryId", "title", "neighborhood", "reference");
        for (String name : required) if (parts.stream().filter(p -> name.equals(p.getName())).count() != 1)
            throw new OccurrenceValidationException(Map.of(name, List.of("Envie exatamente uma parte por campo obrigatório.")));
        for (String name : List.of("description", "image", "video", "media", "latitude", "longitude"))
            if (parts.stream().filter(p -> name.equals(p.getName())).count() > 1) throw MediaManifest.invalid();
        for (var part : parts) {
            boolean file = part.getSubmittedFileName() != null;
            if (!Set.of("categoryId", "title", "description", "neighborhood", "reference", "latitude", "longitude", "image", "images", "video", "media").contains(part.getName())) throw MediaManifest.invalid();
            boolean photo = Set.of("image", "images", "video").contains(part.getName());
            if (photo && !file || file && !photo && !part.getName().equals("media")) throw MediaManifest.invalid();
            if (!photo && part.getSize() > 8192) throw MediaManifest.invalid();
        }
        for (var part : parts) {
            if (Set.of("image", "images").contains(part.getName()) && part.getSize() > 5242880)
                throw new OccurrenceWriteException(org.springframework.http.HttpStatus.CONTENT_TOO_LARGE, "IMAGE_TOO_LARGE");
        }
        var media = request.getPart("media");
        boolean videoMode = request.getPart("video") != null;
        if (videoMode && (image != null || images != null && !images.isEmpty())) throw MediaManifest.invalid();
        if (image != null && (images != null && !images.isEmpty() || media != null)) throw MediaManifest.invalid();
        var files = videoMode ? List.of(Objects.requireNonNull(video)) : image == null ? images == null ? List.<MultipartFile>of() : images : List.of(image);
        if (files.size() > 5 || creating && (files.isEmpty() || media != null)) throw MediaManifest.invalid();
        MediaManifest manifest = null;
        if (media != null) {
            try {
                var type = org.springframework.http.MediaType.parseMediaType(media.getContentType() == null ? "text/plain" : media.getContentType());
                if (!org.springframework.http.MediaType.APPLICATION_JSON.isCompatibleWith(type)) throw MediaManifest.invalid();
            } catch (org.springframework.http.InvalidMediaTypeException invalid) { throw MediaManifest.invalid(); }
            try (var input = media.getInputStream()) { manifest = MediaManifest.parse(input.readNBytes(8193)); }
        }
        if (!creating && image == null && !files.isEmpty() && manifest == null) throw MediaManifest.invalid();
        return new OccurrenceMultipart(files, manifest, image != null, videoMode);
    }
}
