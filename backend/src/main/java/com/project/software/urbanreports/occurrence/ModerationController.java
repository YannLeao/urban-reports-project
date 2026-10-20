package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.api.BoundedJsonInput;
import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/occurrences")
public class ModerationController {
    private final ModerationService service;
    private final BoundedJsonInput input;
    public ModerationController(ModerationService service, BoundedJsonInput input) { this.service = service; this.input = input; }
    @io.swagger.v3.oas.annotations.Operation(summary = "Consultar relatos com filtros de categoria e estado",
        description = "Filtros opcionais combinados por AND antes de contagem/paginação. Valores vazios, repetidos, categoria inexistente ou estado não permitido retornam 400 sanitizado. Marcadores incluem todo o universo filtrado, inclusive legado sem ponto nas contagens.")
    @io.swagger.v3.oas.annotations.Parameters({
        @io.swagger.v3.oas.annotations.Parameter(name = "categoryId", in = io.swagger.v3.oas.annotations.enums.ParameterIn.QUERY,
            description = "ID existente do catálogo; ausência inclui todas as categorias", schema = @io.swagger.v3.oas.annotations.media.Schema(type = "integer")),
        @io.swagger.v3.oas.annotations.Parameter(name = "status", in = io.swagger.v3.oas.annotations.enums.ParameterIn.QUERY,
            description = "Estado exato: PENDING, IN_ANALYSIS, RESOLVED, REJECTED; ausência inclui todos os estados permitidos", schema = @io.swagger.v3.oas.annotations.media.Schema(type = "string")),
        @io.swagger.v3.oas.annotations.Parameter(name = "scope", in = io.swagger.v3.oas.annotations.enums.ParameterIn.QUERY,
            description = "QUEUE (padrão): PENDING/IN_ANALYSIS; ALL: quatro estados. ADMIN ativo exclusivo; não altera transições.",
            schema = @io.swagger.v3.oas.annotations.media.Schema(type = "string", allowableValues = {"QUEUE", "ALL"}, defaultValue = "QUEUE"))
    })
    @GetMapping
    public ResponseEntity<ModerationService.Queue> list(@AuthenticationPrincipal AuthenticatedIdentity actor,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size, @io.swagger.v3.oas.annotations.Parameter(hidden = true) @RequestParam org.springframework.util.MultiValueMap<String, String> params) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(actor, page, size, params));
    }
    @GetMapping("/{id}")
    public ResponseEntity<ModerationService.Detail> find(@AuthenticationPrincipal AuthenticatedIdentity actor, @PathVariable UUID id) {
        return response(service.find(actor, id));
    }
    @GetMapping("/{id}/image")
    public ResponseEntity<byte[]> image(@AuthenticationPrincipal AuthenticatedIdentity actor, @PathVariable UUID id) {
        var image = service.image(actor, id);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(image.contentType())).body(image.content());
    }
    @PostMapping("/{id}/transitions")
    public ResponseEntity<ModerationService.Detail> transition(@AuthenticationPrincipal AuthenticatedIdentity actor, @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String match, HttpServletRequest request) throws Exception {
        var json = input.read(request, Set.of("target", "reason"));
        String target = input.text(json, "target");
        return response(service.transition(actor, id, match, new OccurrenceTransition(
                target == null ? null : OccurrenceStatus.valueOf(target), input.text(json, "reason"))));
    }
    private ResponseEntity<ModerationService.Detail> response(ModerationService.Detail detail) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).eTag("\"" + detail.report().version() + "\"").body(detail);
    }
}
