package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import com.project.software.urbanreports.storage.application.ImageStorageService;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class OccurrenceMediaController {
    private final MediaAccess access;
    private final MediaDelivery delivery;
    private final ImageStorageService images;
    public OccurrenceMediaController(MediaAccess access, MediaDelivery delivery, ImageStorageService images) {
        this.access = access; this.delivery = delivery; this.images = images;
    }
    @io.swagger.v3.oas.annotations.Operation(summary = "Ler mídia após conferir relato, pertencimento e acesso",
        description = "IMAGE mantém GET de fotografia; HEAD usa somente metadados. VIDEO: GET 200 completo ou 206 para Range único fechado/aberto/sufixo. Insatisfazível: 416 com Content-Range bytes */N, sem GET de origem. Range malformado/múltiplo/unidade desconhecida é ignorado. If-Range causa 200 completo, sem validador anunciado. HEAD ignora Range e retorna 200 sem corpo. no-store/nosniff; Accept-Ranges bytes para vídeo. Erros seguem envelope sanitizado (401/403/404/502/503).")
    @RequestMapping(value = {"/api/occurrences/{id}/media/{mediaId}", "/api/{surface:public|admin}/occurrences/{id}/media/{mediaId}"}, method = {RequestMethod.GET, RequestMethod.HEAD})
    public void media(@AuthenticationPrincipal AuthenticatedIdentity actor, @PathVariable(required = false) String surface,
            @PathVariable UUID id, @PathVariable UUID mediaId, HttpServletRequest request, HttpServletResponse response) throws IOException {
        // Service proxy completes its transaction before HEAD/open/copy.
        var ref = access.authorize(actor, surface == null ? "own" : surface, id, mediaId);
        if (ref.type().equals("VIDEO")) { delivery.deliver(ref, request, response); return; }
        if (request.getMethod().equals("HEAD")) {
            var metadata = images.headOccurrenceImage(ref.key());
            response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Content-Type-Options", "nosniff");
            response.setContentType(metadata.contentType()); response.setContentLengthLong(metadata.size()); return;
        }
        var image = images.loadOccurrence(ref.key());
        response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Content-Type-Options", "nosniff");
        response.setContentType(image.contentType()); response.setContentLengthLong(image.contentLength());
        if (!request.getMethod().equals("HEAD")) response.getOutputStream().write(image.content());
    }
}
