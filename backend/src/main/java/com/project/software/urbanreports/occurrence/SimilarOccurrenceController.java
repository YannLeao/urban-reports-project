package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
class SimilarOccurrenceController {
    private final SimilarOccurrenceService service;
    SimilarOccurrenceController(SimilarOccurrenceService service) { this.service = service; }

    @PostMapping("/api/occurrences/similar")
    @Operation(summary = "Consultar sugestões próximas (USER ativo)", description = "POST somente leitura, JSON até 8192 bytes: categoryId inteiro existente, latitude/longitude numéricas finitas WGS84 e excludeOccurrenceId UUID opcional próprio. Mesma categoria, PENDING/IN_ANALYSIS públicos, até 100m inclusivos, cinco por distância ASC, createdAt DESC, id DESC. Sem mídia/autoria/coordenadas dos candidatos. 400 inválido, 401 sessão inválida, 403 papel incorreto, 404 exclusão alheia/inexistente, 503 persistência indisponível. Aviso não bloqueia gravação; no-store.")
    @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true, content = @io.swagger.v3.oas.annotations.media.Content(
            mediaType = "application/json", schema = @io.swagger.v3.oas.annotations.media.Schema(implementation = SimilarOccurrenceRequest.class)))
    ResponseEntity<SimilarOccurrenceService.Result> read(@AuthenticationPrincipal AuthenticatedIdentity actor,
            HttpServletRequest request) throws java.io.IOException {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.read(actor.userId(), SimilarOccurrenceRequest.read(request)));
    }
}
