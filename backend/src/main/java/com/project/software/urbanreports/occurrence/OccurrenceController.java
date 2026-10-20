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
    private final OccurrenceFilterParser filters;
    private final OccurrenceCategoryRepository categories;
    private final OccurrenceService service;

    public OccurrenceController(OccurrenceCategoryRepository categories, OccurrenceService service, OccurrenceFilterParser filters) {
        this.categories = categories;
        this.service = service; this.filters = filters;
    }

    @GetMapping({"/occurrence-categories", "/public/occurrence-categories"})
    public List<OccurrenceCategoryResponse> categories() {
        return categories.findAll(Sort.by(Sort.Direction.ASC, "id")).stream()
            .map(category -> new OccurrenceCategoryResponse(category.getId(), category.getName())).toList();
    }

    @io.swagger.v3.oas.annotations.Operation(summary = "Consultar relatos com filtros de categoria e estado",
        description = "Filtros opcionais combinados por AND antes de contagem/paginação. Valores vazios, repetidos, categoria inexistente ou estado não permitido retornam 400 sanitizado. Marcadores incluem todo o universo filtrado, inclusive legado sem ponto nas contagens.")
    @io.swagger.v3.oas.annotations.Parameters({
        @io.swagger.v3.oas.annotations.Parameter(name = "categoryId", in = io.swagger.v3.oas.annotations.enums.ParameterIn.QUERY,
            description = "ID existente do catálogo; ausência inclui todas as categorias", schema = @io.swagger.v3.oas.annotations.media.Schema(type = "integer")),
        @io.swagger.v3.oas.annotations.Parameter(name = "status", in = io.swagger.v3.oas.annotations.enums.ParameterIn.QUERY,
            description = "Estado exato: PENDING, IN_ANALYSIS, RESOLVED, REJECTED; ausência inclui todos os estados permitidos", schema = @io.swagger.v3.oas.annotations.media.Schema(type = "string"))
    })
    @GetMapping("/occurrences")
    public ResponseEntity<List<OccurrenceResponse>> mine(@AuthenticationPrincipal AuthenticatedIdentity identity, @io.swagger.v3.oas.annotations.Parameter(hidden = true) @RequestParam org.springframework.util.MultiValueMap<String, String> params) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.findByAuthorId(identity.userId(), filters.parse(params, OccurrenceFilters.Context.OWN)));
    }

    @GetMapping("/occurrences/{id}")
    public ResponseEntity<OccurrenceResponse> detail(@AuthenticationPrincipal AuthenticatedIdentity identity,
            @PathVariable UUID id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.findById(identity.userId(), id));
    }

    @io.swagger.v3.oas.annotations.Operation(summary = "Registrar relato com 1 a 5 fotos OU um vídeo",
            description = "Envie images repetido (1–5), na ordem da coleção. image é alias legado singular, sem mistura. JPEG/PNG/WebP estático: 5 MiB por arquivo, 26 MiB por requisição. Primeira foto é a capa. Alternativa exclusiva: uma parte video MP4 H.264 progressivo, 8-bit 4:2:0, até 25 MiB, 30 s, 720p e 30 fps; áudio AAC-LC opcional. Bytes originais preservados.",
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(content = @io.swagger.v3.oas.annotations.media.Content(
                    mediaType = "multipart/form-data", schema = @io.swagger.v3.oas.annotations.media.Schema(implementation = PhotoForm.class),
                    encoding = @io.swagger.v3.oas.annotations.media.Encoding(name = "media", contentType = "application/json"))))
    @PostMapping(path = "/occurrences", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<OccurrenceResponse> create(@AuthenticationPrincipal AuthenticatedIdentity identity,
            @RequestParam Integer categoryId, @RequestParam String title, @RequestParam(required = false) String description,
            @RequestParam String neighborhood, @RequestParam String reference,
            @RequestParam(required = false) String latitude, @RequestParam(required = false) String longitude,
            @RequestPart(value = "image", required = false) MultipartFile image,
            @RequestPart(value = "images", required = false) List<MultipartFile> images, @RequestPart(value = "video", required = false) MultipartFile video, HttpServletRequest request) throws Exception {
        var media = OccurrenceMultipart.read(request, images, image, true, video);
        OccurrenceResponse response = service.createPhotos(identity,
                new OccurrenceRequest(categoryId, title, description, neighborhood, reference, latitude, longitude), media.images(), media.video());
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(response);
    }

    @GetMapping("/occurrences/{id}/image")
    public ResponseEntity<byte[]> image(@AuthenticationPrincipal AuthenticatedIdentity identity, @PathVariable UUID id) {
        var image = service.image(identity.userId(), id);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(image.contentType())).body(image.content());
    }

    @io.swagger.v3.oas.annotations.Operation(summary = "Editar campos e coleção final de fotos OU vídeo",
            description = "Exige If-Match e PENDING. Sem media/arquivos preserva todas as fotos. media é parte application/json: {items:[{id:UUID},{uploadIndex:0}]}. Lista final de 1–5 fotos OU um vídeo, sem mistura nem repetição e usando cada images novo exatamente uma vez. image legado só substitui uma foto; não substitui vídeo. video novo usa uploadIndex 0. Troca integral de tipo exige manifesto. Removidas são descartadas eventualmente.",
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(content = @io.swagger.v3.oas.annotations.media.Content(
                    mediaType = "multipart/form-data", schema = @io.swagger.v3.oas.annotations.media.Schema(implementation = PhotoForm.class),
                    encoding = @io.swagger.v3.oas.annotations.media.Encoding(name = "media", contentType = "application/json"))))
    @org.springframework.web.bind.annotation.PutMapping(path = "/occurrences/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<OccurrenceResponse> update(@AuthenticationPrincipal AuthenticatedIdentity identity,
            @PathVariable UUID id, @org.springframework.web.bind.annotation.RequestHeader(value = "If-Match", required = false) String match,
            @RequestParam Integer categoryId, @RequestParam String title, @RequestParam(required = false) String description,
            @RequestParam String neighborhood, @RequestParam String reference,
            @RequestParam(required = false) String latitude, @RequestParam(required = false) String longitude,
            @RequestPart(value = "image", required = false) MultipartFile image,
            @RequestPart(value = "images", required = false) List<MultipartFile> images, @RequestPart(value = "video", required = false) MultipartFile video, HttpServletRequest request) throws Exception {
        var media = OccurrenceMultipart.read(request, images, image, false, video);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.updatePhotos(identity, id, match,
                new OccurrenceRequest(categoryId, title, description, neighborhood, reference, latitude, longitude), media.images(), media.manifest(), media.legacy(), media.video()));
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/occurrences/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthenticatedIdentity identity, @PathVariable UUID id,
            @org.springframework.web.bind.annotation.RequestHeader(value = "If-Match", required = false) String match) {
        service.delete(identity, id, match);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    public record PhotoForm(Integer categoryId, String title, String description, String neighborhood,
            String reference, Double latitude, Double longitude,
            @io.swagger.v3.oas.annotations.media.ArraySchema(maxItems = 5, schema = @io.swagger.v3.oas.annotations.media.Schema(type = "string", format = "binary"))
            List<String> images,
            @io.swagger.v3.oas.annotations.media.Schema(type = "string", format = "binary", description = "Alias legado singular; não misturar com images/media") String image,
            @io.swagger.v3.oas.annotations.media.Schema(description = "Somente PUT: parte application/json com items ordenados; id existente OU uploadIndex inteiro", example = "{\"items\":[{\"uploadIndex\":0}]}") String media, @io.swagger.v3.oas.annotations.media.Schema(type = "string", format = "binary", description = "Um MP4 H.264, até 25 MiB e 30 segundos; exclusivo com fotos") String video) {}

    public record OccurrenceCategoryResponse(Integer id, String name) {}
}
