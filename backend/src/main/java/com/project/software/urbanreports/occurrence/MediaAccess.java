package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.administration.AccountAccess;
import com.project.software.urbanreports.auth.AuthenticatedIdentity;
import com.project.software.urbanreports.identity.AccountRole;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MediaAccess {
    private final OccurrenceRepository reports;
    private final AccountAccess access;
    public MediaAccess(OccurrenceRepository reports, AccountAccess access) { this.reports = reports; this.access = access; }
    record Reference(String key, String type, Long size) {}
    @Transactional(readOnly = true)
    public Reference authorize(AuthenticatedIdentity actor, String surface, UUID id, UUID mediaId) {
        Occurrence report;
        if (surface.equals("public")) report = reports.findByIdAndStatusNot(id, OccurrenceStatus.REJECTED)
            .orElseThrow(() -> new OccurrenceNotFoundException(id));
        else if (surface.equals("admin")) {
            access.check(actor, AccountRole.ADMIN);
            report = reports.findById(id).orElseThrow(() -> new OccurrenceNotFoundException(id));
        } else {
            access.check(actor, AccountRole.USER);
            report = reports.findByIdAndAuthorId(id, actor.userId()).orElseThrow(() -> new OccurrenceNotFoundException(id));
        }
        var item = report.getMedia().stream().filter(m -> m.getId().equals(mediaId)).findFirst()
            .orElseThrow(() -> new OccurrenceNotFoundException(id));
        var response = item.response("");
        return new Reference(item.getObjectKey(), item.kind(), response.sizeBytes());
    }
}
