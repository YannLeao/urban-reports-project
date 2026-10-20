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
    private final OccurrenceFilterParser filters;
    private final PublicOccurrenceService service;

    public PublicOccurrenceController(PublicOccurrenceService service, OccurrenceFilterParser filters) {
        this.service = service; this.filters = filters;
    }

    @io.swagger.v3.oas.annotations.Operation(summary = "Consultar relatos com filtros de categoria e estado",
        description = "Filtros opcionais combinados por AND antes de contagem/paginação. Valores vazios, repetidos, categoria inexistente ou estado não permitido retornam 400 sanitizado. Marcadores incluem todo o universo filtrado, inclusive legado sem ponto nas contagens.")
    @io.swagger.v3.oas.annotations.Parameters({
        @io.swagger.v3.oas.annotations.Parameter(name = "categoryId", in = io.swagger.v3.oas.annotations.enums.ParameterIn.QUERY,
            description = "ID existente do catálogo; ausência inclui todas as categorias", schema = @io.swagger.v3.oas.annotations.media.Schema(type = "integer")),
        @io.swagger.v3.oas.annotations.Parameter(name = "status", in = io.swagger.v3.oas.annotations.enums.ParameterIn.QUERY,
            description = "Estado exato: PENDING, IN_ANALYSIS, RESOLVED; ausência inclui todos os estados permitidos", schema = @io.swagger.v3.oas.annotations.media.Schema(type = "string"))
    })
    @GetMapping
    public ResponseEntity<PublicOccurrencePage> list(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size, @io.swagger.v3.oas.annotations.Parameter(hidden = true) @RequestParam org.springframework.util.MultiValueMap<String, String> params) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(page, size, filters.parse(params, OccurrenceFilters.Context.PUBLIC)));
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