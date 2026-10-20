package com.project.software.urbanreports.occurrence;

import java.math.BigDecimal;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import com.project.software.urbanreports.administration.AdministrationException;
import static com.project.software.urbanreports.occurrence.OccurrenceReportService.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class OccurrenceReportPdfTests {
    static final Instant REFERENCE = Instant.parse("2026-10-20T00:00:00Z");
    static final Instant GENERATED = Instant.parse("2026-10-20T01:00:00Z");
    static Report sample(int groups, BigDecimal average, long invalid) {
        var localities = new ArrayList<LocalityCount>();
        if (groups > 0) {
            localities.add(new LocalityCount(null, 1));
            localities.add(new LocalityCount("Não informado", 1));
            localities.add(new LocalityCount("Céntro 😀 漢 <script>alert(1)</script>", 1));
            localities.add(new LocalityCount("Localidade com nome muito longo " + "Árvore".repeat(30), 1));
            for (int i = 4; i < groups; i++) localities.add(new LocalityCount(String.format(Locale.ROOT, "Bairro sintético %05d", i), 1));
        }
        var categories = new ArrayList<CategoryCount>();
        for (int i = 1; i <= 8; i++) categories.add(new CategoryCount(i, "Categoria de iluminação pública " + i, i == 1 ? groups : 0));
        if (groups == 6) return new Report(6, List.of(new CategoryCount(1, "Iluminação pública", 3),
                new CategoryCount(2, "Buraco ou pavimentação", 3), new CategoryCount(3, "Limpeza urbana", 0),
                new CategoryCount(4, "Saneamento", 0), new CategoryCount(5, "Arborização", 0),
                new CategoryCount(6, "Trânsito", 0), new CategoryCount(7, "Acessibilidade", 0), new CategoryCount(8, "Outros", 0)),
                List.of(new StatusCount(OccurrenceStatus.PENDING, 1), new StatusCount(OccurrenceStatus.IN_ANALYSIS, 1),
                        new StatusCount(OccurrenceStatus.RESOLVED, 2), new StatusCount(OccurrenceStatus.REJECTED, 2)),
                List.of(new LocalityCount("Centro", 3), new LocalityCount("Bairro A", 2), new LocalityCount(null, 1)),
                average, 2 - invalid, invalid, new BigDecimal("33.3333333333"), REFERENCE);
        long valid = average == null ? 0 : Math.min(2, groups), rejected = groups / 3;
        return new Report(groups, categories, List.of(new StatusCount(OccurrenceStatus.PENDING, Math.max(0, groups - valid - invalid - rejected)),
                new StatusCount(OccurrenceStatus.IN_ANALYSIS, 0), new StatusCount(OccurrenceStatus.RESOLVED, valid + invalid),
                new StatusCount(OccurrenceStatus.REJECTED, rejected)), localities, average, valid, invalid,
                groups == 0 ? null : BigDecimal.valueOf(rejected * 100).divide(BigDecimal.valueOf(groups), 12, java.math.RoundingMode.HALF_UP), REFERENCE);
    }
    @Test void realPdfPreservesTextFontsA4MetadataAllGroupsAndFooters() throws Exception {
        var report = sample(75, new BigDecimal("14400"), 1);
        try (var pdf = Loader.loadPDF(new OccurrenceReportPdf().render(report, GENERATED))) {
            assertThat(pdf.getNumberOfPages()).isGreaterThan(2);
            assertThat(pdf.getDocumentCatalog().getLanguage()).isEqualTo("pt-BR");
            assertThat(pdf.getDocumentInformation().getTitle()).isEqualTo("Alô Cidade — Relatório administrativo resumido");
            assertThat(pdf.getDocumentInformation().getAuthor()).isEqualTo("Alô Cidade");
            var text = new PDFTextStripper().getText(pdf);
            assertThat(text).contains("Total de relatos: 75", "4 h", "14.400", "33,3%", "Média parcial", "Amostra: 2",
                    "19/10/2026 21:00:00 -03:00 America/Sao_Paulo", "19/10/2026 22:00:00 -03:00 America/Sao_Paulo",
                    "Não informado (campo vazio)", "[U+1F600]", "[U+6F22]", "<script>alert(1)</script>");
            for (int i = 4; i < 75; i++) assertThat(text.split(String.format(Locale.ROOT, "Bairro sintético %05d", i), -1)).hasSize(2);
            for (int i = 0; i < pdf.getNumberOfPages(); i++) {
                var page = pdf.getPage(i);
                assertThat(page.getMediaBox().getWidth()).isEqualTo(PDRectangle.A4.getWidth());
                assertThat(page.getMediaBox().getHeight()).isEqualTo(PDRectangle.A4.getHeight());
                for (var name : page.getResources().getFontNames()) assertThat(page.getResources().getFont(name).isEmbedded()).isTrue();
                assertThat(text).contains("Página " + (i + 1) + " de " + pdf.getNumberOfPages());
                assertThat(page.getAnnotations()).isEmpty();
            }
        }
    }
    @Test void nullZeroSubsecondAndDaysAreDistinct() throws Exception {
        for (BigDecimal average : Arrays.asList(null, BigDecimal.ZERO, new BigDecimal("0.125"), new BigDecimal("183600"))) {
            try (var pdf = Loader.loadPDF(new OccurrenceReportPdf().render(sample(0, average, 0), GENERATED))) {
                var text = new PDFTextStripper().getText(pdf);
                assertThat(text).contains("Total de relatos: 0", "Proporção de rejeitadas: Sem dados", "Sem dados de localidades.");
                assertThat(text).contains(average == null ? "resolução: Sem dados" : average.signum() == 0 ? "resolução: 0 segundos"
                        : average.compareTo(BigDecimal.ONE) < 0 ? "0,125 segundos" : "2,13 dias");
            }
        }
    }
    @Test void zeroAndHundredPercentAndNoValidPartialSampleRemainExplicit() throws Exception {
        for (int rejected : List.of(0, 6)) {
            var report = new Report(6, List.of(new CategoryCount(1, "Iluminação pública", 6)),
                    List.of(new StatusCount(OccurrenceStatus.PENDING, rejected == 0 ? 4 : 0),
                            new StatusCount(OccurrenceStatus.IN_ANALYSIS, 0), new StatusCount(OccurrenceStatus.RESOLVED, rejected == 0 ? 2 : 0),
                            new StatusCount(OccurrenceStatus.REJECTED, rejected)),
                    List.of(new LocalityCount("Centro", 6)), null, 0, rejected == 0 ? 2 : 0,
                    BigDecimal.valueOf(rejected == 0 ? 0 : 100), REFERENCE);
            try (var pdf = Loader.loadPDF(new OccurrenceReportPdf().render(report, GENERATED))) {
                var text = new PDFTextStripper().getText(pdf);
                assertThat(text).contains("Proporção de rejeitadas: " + (rejected == 0 ? "0%" : "100%"),
                        "Tempo médio de resolução: Sem dados", "Amostra: 0");
                if (rejected == 0) assertThat(text).contains("Média parcial", "2 sem duração válida");
            }
        }
    }

    @Test void snapshotCollectionsCannotBeChanged() {
        assertThatThrownBy(() -> sample(0, null, 0).categories().clear()).isInstanceOf(UnsupportedOperationException.class);
    }
    @Test void singleAdmissionRejectsConcurrentGenerationAndReleasesAfterFailure() throws Exception {
        var reports = mock(OccurrenceReportService.class); var renderer = mock(OccurrenceReportPdf.class);
        var snapshot = sample(0, null, 0); when(reports.get(null)).thenReturn(snapshot);
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        when(renderer.render(snapshot, GENERATED)).thenAnswer(call -> { entered.countDown(); release.await(5, TimeUnit.SECONDS); throw new java.io.IOException("private resource path"); });
        var export = new OccurrenceReportExport(reports, renderer, Clock.fixed(GENERATED, ZoneOffset.UTC));
        try (var executor = Executors.newSingleThreadExecutor()) {
            var first = executor.submit(() -> export.generate(null));
            try {
                assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> export.generate(null)).isInstanceOfSatisfying(AdministrationException.class,
                        failure -> assertThat(failure.code).isEqualTo("REPORT_PDF_CAPACITY"));
                verify(reports, times(1)).get(null);
            } finally { release.countDown(); }
            assertThatThrownBy(() -> first.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(IllegalStateException.class);
        }
        doReturn(new byte[]{1}).when(renderer).render(snapshot, GENERATED);
        assertThat(export.generate(null).bytes()).containsExactly(1);
        verify(reports, times(2)).get(null); verify(renderer, times(2)).render(snapshot, GENERATED);
    }
    @Test void pageLimitFailsInsteadOfTruncating() {
        assertThatThrownBy(() -> new OccurrenceReportPdf().render(sample(15000, null, 0), GENERATED))
                .isInstanceOfSatisfying(AdministrationException.class, error -> assertThat(error.code).isEqualTo("REPORT_PDF_CAPACITY"));
    }
    @Test void generateReviewExamples() throws Exception {
        Path directory = Path.of("target/report-pdf-review"); Files.createDirectories(directory);
        for (var name : List.of("reference", "empty", "partial", "localities")) {
            var report = sample(name.equals("empty") ? 0 : name.equals("localities") ? 75 : 6,
                    name.equals("empty") ? null : new BigDecimal("14400"), name.equals("partial") ? 1 : 0);
            Files.write(directory.resolve(name + ".pdf"), new OccurrenceReportPdf().render(report, GENERATED));
        }
    }
}
