package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OccurrenceMarkersController {
    private final OccurrenceFilterParser filters;
    private final OccurrenceMarkersService service;
    public OccurrenceMarkersController(OccurrenceMarkersService service, OccurrenceFilterParser filters) { this.service = service; this.filters = filters; }

    @io.swagger.v3.oas.annotations.Operation(summary = "Consultar relatos com filtros de categoria e estado",
        description = "Filtros opcionais combinados por AND antes de contagem/paginação. Valores vazios, repetidos, categoria inexistente ou estado não permitido retornam 400 sanitizado. Marcadores incluem todo o universo filtrado, inclusive legado sem ponto nas contagens.")
    @io.swagger.v3.oas.annotations.Parameters({
        @io.swagger.v3.oas.annotations.Parameter(name = "categoryId", in = io.swagger.v3.oas.annotations.enums.ParameterIn.QUERY,
            description = "ID existente do catálogo; ausência inclui todas as categorias", schema = @io.swagger.v3.oas.annotations.media.Schema(type = "integer")),
        @io.swagger.v3.oas.annotations.Parameter(name = "status", in = io.swagger.v3.oas.annotations.enums.ParameterIn.QUERY,
            description = "Estado exato: PENDING, IN_ANALYSIS, RESOLVED; ausência inclui todos os estados permitidos", schema = @io.swagger.v3.oas.annotations.media.Schema(type = "string"))
    })
    @GetMapping("/api/public/occurrences/markers")
    public ResponseEntity<MarkerSet> publicMarkers(@io.swagger.v3.oas.annotations.Parameter(hidden = true) @org.springframework.web.bind.annotation.RequestParam org.springframework.util.MultiValueMap<String, String> params) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.read(null, filters.parse(params, OccurrenceFilters.Context.PUBLIC)));
    }

    @io.swagger.v3.oas.annotations.Operation(summary = "Consultar relatos com filtros de categoria e estado",
        description = "Filtros opcionais combinados por AND antes de contagem/paginação. Valores vazios, repetidos, categoria inexistente ou estado não permitido retornam 400 sanitizado. Marcadores incluem todo o universo filtrado, inclusive legado sem ponto nas contagens.")
    @io.swagger.v3.oas.annotations.Parameters({
        @io.swagger.v3.oas.annotations.Parameter(name = "categoryId", in = io.swagger.v3.oas.annotations.enums.ParameterIn.QUERY,
            description = "ID existente do catálogo; ausência inclui todas as categorias", schema = @io.swagger.v3.oas.annotations.media.Schema(type = "integer")),
        @io.swagger.v3.oas.annotations.Parameter(name = "status", in = io.swagger.v3.oas.annotations.enums.ParameterIn.QUERY,
            description = "Estado exato: PENDING, IN_ANALYSIS, RESOLVED, REJECTED; ausência inclui todos os estados permitidos", schema = @io.swagger.v3.oas.annotations.media.Schema(type = "string"))
    })
    @GetMapping("/api/occurrences/markers")
    public ResponseEntity<MarkerSet> ownMarkers(@AuthenticationPrincipal AuthenticatedIdentity identity, @io.swagger.v3.oas.annotations.Parameter(hidden = true) @org.springframework.web.bind.annotation.RequestParam org.springframework.util.MultiValueMap<String, String> params) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.read(identity.userId(), filters.parse(params, OccurrenceFilters.Context.OWN)));
    }

    public record Marker(UUID id, int categoryId, String categoryName, String title, OccurrenceStatus status,
            Double latitude, Double longitude) {}
    public record MarkerSet(List<Marker> items, int total, int located, int unlocated) {}
}
