package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import io.swagger.v3.oas.annotations.Operation;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/reports/occurrences")
public class OccurrenceReportController {
    private final OccurrenceReportService service;
    private final OccurrenceReportExport export;
    public OccurrenceReportController(OccurrenceReportService service, OccurrenceReportExport export) { this.service = service; this.export = export; }

    @GetMapping
    @Operation(summary = "Relatório global de relatos persistidos (ADMIN ativo)", description = "Snapshot sem período; inclui rejeitados. averageResolutionSeconds é a média em segundos da criação ao evento final válido, null sem amostra. resolvedSampleSize/resolvedWithoutValidDuration informam a amostra e as inconsistências. rejectedPercentage é 100 × rejeitados / total (0–100), null se total zero. Localidade null significa Não informado; trim ASCII externo, sem fusão por caixa/acento. Categorias por ID e quatro estados fixos incluem zeros; localidades por contagem decrescente e texto. generatedAt é o início da transação, sem atualização em tempo real.")
    public ResponseEntity<OccurrenceReportService.Report> get(@AuthenticationPrincipal AuthenticatedIdentity actor) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(actor));
    }
    @GetMapping("/pdf")
    @Operation(summary = "Baixar PDF global atual (ADMIN ativo)")
    public ResponseEntity<byte[]> pdf(@AuthenticationPrincipal AuthenticatedIdentity actor) throws java.io.IOException {
        var file = export.generate(actor);
        String timestamp = java.time.format.DateTimeFormatter.ofPattern("uuuuMMdd-HHmmss'Z'", java.util.Locale.ROOT)
                .withZone(java.time.ZoneOffset.UTC).format(file.generatedAt());
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("alo-cidade-relatorio-" + timestamp + ".pdf").build().toString())
                .header("X-Content-Type-Options", "nosniff").contentLength(file.bytes().length).body(file.bytes());
    }
}
