package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.administration.AdministrationException;
import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import java.lang.management.ManagementFactory;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.apache.pdfbox.Loader;
import static com.project.software.urbanreports.occurrence.OccurrenceReportService.*;

/** Synthetic offline runtime probe; never starts Spring or connects to a database. */
public final class ReportPdfProbe {
    private ReportPdfProbe() {}
    public static void main(String[] args) throws Exception {
        int groups = args.length == 0 ? 5000 : Integer.parseInt(args[0]);
        var localities = new ArrayList<LocalityCount>();
        for (int i = 0; i < groups; i++) localities.add(new LocalityCount("Bairro sintético " + i, 1));
        var report = new Report(groups, List.of(new CategoryCount(1, "Iluminação pública", groups)),
                List.of(new StatusCount(OccurrenceStatus.PENDING, groups), new StatusCount(OccurrenceStatus.IN_ANALYSIS, 0),
                        new StatusCount(OccurrenceStatus.RESOLVED, 0), new StatusCount(OccurrenceStatus.REJECTED, 0)),
                localities, null, 0, 0, java.math.BigDecimal.ZERO, Instant.parse("2026-10-20T00:00:00Z"));
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        var renderer = new OccurrenceReportPdf() {
            @Override public byte[] render(Report snapshot, Instant at) throws java.io.IOException {
                entered.countDown();
                try { if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Probe timeout"); }
                catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IllegalStateException(error); }
                return super.render(snapshot, at);
            }
        };
        var source = new OccurrenceReportService(null, null) { @Override public Report get(AuthenticatedIdentity actor) { return report; } };
        var export = new OccurrenceReportExport(source, renderer, Clock.fixed(Instant.parse("2026-10-20T01:00:00Z"), ZoneOffset.UTC));
        long start = System.nanoTime(); byte[] bytes;
        try (var executor = Executors.newSingleThreadExecutor()) {
            var first = executor.submit(() -> export.generate(null));
            try {
                if (!entered.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Probe timeout");
                try { export.generate(null); throw new IllegalStateException("Admission failed"); }
                catch (AdministrationException expected) { System.out.println("concurrent=" + expected.status.value() + " " + expected.code); }
            } finally { release.countDown(); }
            bytes = first.get(60, TimeUnit.SECONDS).bytes();
        }
        double seconds = (System.nanoTime() - start) / 1_000_000_000d;
        try (var pdf = Loader.loadPDF(bytes)) {
            System.out.printf(Locale.ROOT, "java=%s user=%s headless=%s groups=%d pages=%d bytes=%d seconds=%.3f heapUsed=%d heapMax=%d%n",
                    System.getProperty("java.version"), System.getProperty("user.name"), java.awt.GraphicsEnvironment.isHeadless(),
                    groups, pdf.getNumberOfPages(), bytes.length, seconds,
                    ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed(), Runtime.getRuntime().maxMemory());
        }
        for (var pool : ManagementFactory.getMemoryPoolMXBeans()) if (pool.getType() == java.lang.management.MemoryType.HEAP)
            System.out.println("heapPool=" + pool.getName() + " peakUsed=" + pool.getPeakUsage().getUsed());
        if (Files.exists(Path.of("/proc/self/status"))) try (var lines = Files.lines(Path.of("/proc/self/status"))) {
            lines.filter(line -> line.startsWith("VmHWM:")).forEach(System.out::println);
        }
        if (args.length > 1) Files.write(Path.of(args[1]), bytes);
    }
}
