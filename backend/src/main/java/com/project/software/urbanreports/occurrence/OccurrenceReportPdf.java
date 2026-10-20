package com.project.software.urbanreports.occurrence;

import java.awt.Color;
import java.io.*;
import java.math.*;
import java.text.NumberFormat;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.stereotype.Component;
import com.project.software.urbanreports.administration.AdministrationException;
import static org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE;

/** Per-generation document/fonts/streams; input is an authorized, detached snapshot only. */
@Component
public class OccurrenceReportPdf {
    public static final int MAX_BYTES = 16 * 1024 * 1024;
    public static final int MAX_PAGES = 512;
    private static final Locale PT = Locale.forLanguageTag("pt-BR");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/uuuu HH:mm:ss XXX 'America/Sao_Paulo'", PT)
            .withZone(ZoneId.of("America/Sao_Paulo"));
    private static final float MARGIN = 46, BOTTOM = 66, WIDTH = PDRectangle.A4.getWidth() - 2 * MARGIN;

    public byte[] render(OccurrenceReportService.Report report, Instant fileGeneratedAt) throws IOException {
        try (var document = new PDDocument()) {
            var info = document.getDocumentInformation();
            info.setTitle("Alô Cidade — Relatório administrativo resumido");
            info.setAuthor("Alô Cidade"); info.setSubject("Indicadores agregados · Uso administrativo");
            document.getDocumentCatalog().setLanguage("pt-BR");
            try (var layout = new Layout(document)) {
                layout.start();
                layout.paragraph("Alô Cidade — Relatório administrativo resumido", 18, true);
                layout.paragraph("Uso administrativo · Relatório global atual, sem filtros de período", 10, false);
                layout.paragraph("Referência dos dados: " + DATE.format(report.generatedAt()), 9, false);
                layout.paragraph("Geração do arquivo: " + DATE.format(fileGeneratedAt), 9, false);
                layout.gap(12);
                layout.section("Indicadores");
                layout.paragraph("Total de relatos: " + number(report.total()), 14, true);
                layout.paragraph("Tempo médio de resolução: " + duration(report.averageResolutionSeconds()), 14, true);
                if (report.averageResolutionSeconds() != null) layout.paragraph("Valor em segundos: " + decimal(report.averageResolutionSeconds()) + ".", 10, false);
                layout.paragraph("Da criação à resolução · Amostra: " + number(report.resolvedSampleSize())
                        + " resolvidas; " + number(report.resolvedWithoutValidDuration()) + " sem duração válida.", 10, false);
                if (report.resolvedWithoutValidDuration() > 0) layout.paragraph("Média parcial: as resolvidas sem duração válida foram excluídas da média.", 10, true);
                layout.paragraph("Proporção de rejeitadas: " + (report.rejectedPercentage() == null ? "Sem dados"
                        : rounded(report.rejectedPercentage(), 1) + "%"), 14, true);
                layout.gap(8);
                layout.section("Por categoria");
                for (var item : report.categories()) layout.row(item.categoryName(), item.count(), report.total(), false);
                layout.section("Por estado");
                for (var item : report.statuses()) layout.row(switch (item.status()) {
                    case PENDING -> "Pendente"; case IN_ANALYSIS -> "Em análise";
                    case RESOLVED -> "Resolvida"; case REJECTED -> "Rejeitada";
                }, item.count(), report.total(), false);
                if (!report.localities().isEmpty()) {
                    var first = report.localities().getFirst();
                    layout.ensure(Math.min(600, layout.wrap(first.locality() == null ? "Não informado (campo vazio)" : first.locality(),
                            10, false, WIDTH - Math.max(65, layout.width(number(first.count()), 10, true) + 18)).size() * 14 + 13) + 64);
                }
                layout.section("Por bairro/localidade");
                layout.tableHeader();
                if (report.localities().isEmpty()) layout.paragraph("Sem dados de localidades.", 10, false);
                for (var item : report.localities()) layout.row(item.locality() == null ? "Não informado (campo vazio)" : item.locality(), item.count(), report.total(), true);
                layout.section("Como interpretar");
                layout.paragraph("População atual, sem período: inclui os quatro estados e rejeitados. Relatos excluídos fisicamente não entram; não é o total histórico de cadastros.", 10, false);
                layout.paragraph("A média considera o tempo contínuo da criação ao evento final válido de resolução, incluindo noites e fins de semana. A amostra e as exclusões estão acima. Duração zero é válida; Sem dados indica ausência de amostra válida.", 10, false);
                layout.paragraph("A proporção corresponde a rejeitadas / total × 100; Sem dados indica total zero. Contagens e ordem dos grupos preservam a consulta, sem fusão de grafias, acentos ou caixa.", 10, false);
                layout.paragraph("Não informado (campo vazio) identifica ausência de localidade. O texto literal Não informado é um grupo separado. Nomes são texto livre e podem conter conteúdo inserido indevidamente; agregação não garante anonimização.", 10, false);
                if (layout.substituted) layout.paragraph("Caracteres sem glifo na fonte aparecem como [U+XXXX], por ponto de código. Quebras e controles também são representados visivelmente. As contagens foram preservadas.", 10, false);
                layout.finish();
            }
            var output = new LimitedOutput();
            document.save(output);
            return output.toByteArray();
        }
    }

    private static String number(long value) { return NumberFormat.getIntegerInstance(PT).format(value); }
    private static String decimal(BigDecimal value) {
        var format = NumberFormat.getNumberInstance(PT); format.setMaximumFractionDigits(Math.max(12, value.scale()));
        return format.format(value);
    }
    private static String rounded(BigDecimal value, int scale) { return decimal(value.setScale(scale, RoundingMode.HALF_UP)); }
    private static String duration(BigDecimal seconds) {
        if (seconds == null) return "Sem dados";
        if (seconds.compareTo(BigDecimal.valueOf(60)) < 0) return decimal(seconds) + " segundos";
        long unit = seconds.compareTo(BigDecimal.valueOf(3600)) < 0 ? 60 : seconds.compareTo(BigDecimal.valueOf(86400)) < 0 ? 3600 : 86400;
        return rounded(seconds.divide(BigDecimal.valueOf(unit), 12, RoundingMode.HALF_UP), 2)
                + (unit == 60 ? " min" : unit == 3600 ? " h" : " dias");
    }
    private static InputStream resource(String name) throws IOException {
        var stream = OccurrenceReportPdf.class.getResourceAsStream("/report-pdf/" + name);
        if (stream == null) throw new IOException("PDF resource unavailable");
        return stream;
    }
    private static AdministrationException limit() { return new AdministrationException(SERVICE_UNAVAILABLE, "REPORT_PDF_CAPACITY"); }
    private static final class LimitedOutput extends ByteArrayOutputStream {
        @Override public synchronized void write(byte[] bytes, int offset, int length) {
            if (length > MAX_BYTES - count) throw limit();
            super.write(bytes, offset, length);
        }
        @Override public synchronized void write(int value) { if (count >= MAX_BYTES) throw limit(); super.write(value); }
    }

    private static final class Layout implements AutoCloseable {
        final PDDocument document;
        final PDType0Font regular, bold;
        final Color ink, muted, accent, line;
        final PDImageXObject brand;
        final long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
        PDPageContentStream stream;
        float y;
        boolean substituted;
        Layout(PDDocument document) throws IOException {
            this.document = document;
            try (var input = resource("Figtree-Regular.ttf")) { regular = PDType0Font.load(document, input); }
            try (var input = resource("Figtree-Bold.ttf")) { bold = PDType0Font.load(document, input); }
            var properties = new Properties();
            try (var input = resource("brand.properties")) { properties.load(input); }
            ink = Color.decode(properties.getProperty("ink")); muted = Color.decode(properties.getProperty("muted"));
            accent = Color.decode(properties.getProperty("accent")); line = Color.decode(properties.getProperty("line"));
            try (var input = resource("brand.png")) { brand = PDImageXObject.createFromByteArray(document, input.readAllBytes(), "Alô Cidade"); }
        }
        void check() { if (System.nanoTime() > deadline) throw limit(); }
        void start() throws IOException {
            check();
            if (document.getNumberOfPages() >= MAX_PAGES) throw limit();
            close();
            var page = new PDPage(PDRectangle.A4); document.addPage(page);
            stream = new PDPageContentStream(document, page);
            y = PDRectangle.A4.getHeight() - MARGIN;
            stream.drawImage(brand, MARGIN, y - 25, 28, 28);
            text("Alô Cidade", MARGIN + 38, y - 16, 14, true, ink);
            y -= 48;
        }
        void ensure(float height) throws IOException { check(); if (y - height < BOTTOM) start(); }
        void gap(float amount) { y -= amount; }
        void section(String title) throws IOException { ensure(72); gap(10); paragraph(title, 13, true); gap(3); }
        void tableHeader() throws IOException {
            text("Bairro/localidade", MARGIN, y, 10, true, muted);
            String count = "Relatos";
            text(count, MARGIN + WIDTH - width(count, 10, true), y, 10, true, muted); y -= 20;
        }
        String safe(String value) throws IOException {
            var result = new StringBuilder();
            for (int cp : value.codePoints().toArray()) {
                String character = new String(Character.toChars(cp));
                try {
                    if (Character.isISOControl(cp) || Character.getType(cp) == Character.FORMAT || Character.getType(cp) == Character.LINE_SEPARATOR || Character.getType(cp) == Character.PARAGRAPH_SEPARATOR) throw new IllegalArgumentException();
                    regular.encode(character); bold.encode(character); result.append(character);
                } catch (IllegalArgumentException failure) { result.append(String.format(Locale.ROOT, "[U+%04X]", cp)); substituted = true; }
            }
            return result.toString();
        }
        float width(String value, float size, boolean strong) throws IOException { return (strong ? bold : regular).getStringWidth(value) / 1000 * size; }
        // Width-based greedy wrap, including unbroken names, using the final glyph representation.
        java.util.List<String> wrap(String value, float size, boolean strong, float available) throws IOException {
            var result = new ArrayList<String>();
            String remaining = safe(value);
            while (!remaining.isEmpty()) {
                check(); int end = 0, lastSpace = -1; float length = 0;
                while (end < remaining.length()) {
                    int next = end + Character.charCount(remaining.codePointAt(end));
                    float part = width(remaining.substring(end, next), size, strong);
                    if (length + part > available && end > 0) break;
                    length += part;
                    if (remaining.charAt(end) == ' ') lastSpace = end;
                    end = next;
                }
                if (end < remaining.length() && lastSpace > 0) end = lastSpace;
                result.add(remaining.substring(0, end));
                remaining = remaining.substring(end);
                if (remaining.startsWith(" ")) remaining = remaining.substring(1);
            }
            if (result.isEmpty()) result.add("");
            return result;
        }
        void paragraph(String value, float size, boolean strong) throws IOException {
            for (String part : wrap(value, size, strong, WIDTH)) {
                ensure(size + 5); text(part, MARGIN, y, size, strong, ink); y -= size + 5;
            }
            y -= 3;
        }
        void row(String label, long count, long total, boolean table) throws IOException {
            String amount = number(count);
            float countWidth = width(amount, 10, true);
            var lines = wrap(label, 10, false, WIDTH - Math.max(65, countWidth + 18));
            // Oversized synthetic/legacy labels can continue over pages; count is drawn exactly once.
            float height = lines.size() * 14 + 13;
            if (y - Math.min(height, 600) < BOTTOM) { start(); if (table) tableHeader(); }
            boolean first = true;
            for (String part : lines) {
                if (y - 27 < BOTTOM) { start(); if (table) tableHeader(); }
                text(part, MARGIN, y, 10, false, ink);
                if (first) text(amount, MARGIN + WIDTH - countWidth, y, 10, true, ink);
                first = false; y -= 14;
            }
            stream.setNonStrokingColor(line); stream.addRect(MARGIN, y + 3, WIDTH, 2); stream.fill();
            if (total > 0 && count > 0) {
                stream.setNonStrokingColor(accent); stream.addRect(MARGIN, y + 3, (float) (WIDTH * Math.min(1, (double) count / total)), 2); stream.fill();
            }
            y -= 13;
        }
        void text(String value, float x, float baseline, float size, boolean strong, Color color) throws IOException {
            stream.beginText(); stream.setFont(strong ? bold : regular, size); stream.setNonStrokingColor(color);
            stream.newLineAtOffset(x, baseline); stream.showText(value); stream.endText();
        }
        void finish() throws IOException {
            close(); int pages = document.getNumberOfPages();
            for (int index = 0; index < pages; index++) {
                try (var footer = new PDPageContentStream(document, document.getPage(index), PDPageContentStream.AppendMode.APPEND, true, true)) {
                    footer.beginText(); footer.setFont(regular, 9); footer.setNonStrokingColor(muted);
                    footer.newLineAtOffset(MARGIN, 34);
                    footer.showText("Alô Cidade · Uso administrativo · Página " + (index + 1) + " de " + pages); footer.endText();
                }
            }
        }
        @Override public void close() throws IOException { if (stream != null) { var current = stream; stream = null; current.close(); } }
    }
}
