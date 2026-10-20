package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.administration.AdministrationException;
import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import java.io.IOException;
import java.time.*;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Service;
import static org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE;

@Service
public class OccurrenceReportExport {
    private final OccurrenceReportService reports;
    private final OccurrenceReportPdf renderer;
    private final Clock clock;
    private final Semaphore capacity = new Semaphore(1);
    public OccurrenceReportExport(OccurrenceReportService reports, OccurrenceReportPdf renderer, Clock clock) {
        this.reports = reports; this.renderer = renderer; this.clock = clock;
    }
    public record File(byte[] bytes, Instant generatedAt) {}
    public File generate(AuthenticatedIdentity actor) throws IOException {
        if (!capacity.tryAcquire()) throw new AdministrationException(SERVICE_UNAVAILABLE, "REPORT_PDF_CAPACITY");
        try {
            // Call the Spring proxy once. Its REQUIRES_NEW transaction ends before render starts.
            var snapshot = reports.get(actor);
            var generatedAt = clock.instant();
            try {
                return new File(renderer.render(snapshot, generatedAt), generatedAt);
            } catch (AdministrationException capacityFailure) { throw capacityFailure;
            } catch (IOException | RuntimeException failure) {
                throw new IllegalStateException("PDF generation failed", failure);
            }
        } finally { capacity.release(); }
    }
}
