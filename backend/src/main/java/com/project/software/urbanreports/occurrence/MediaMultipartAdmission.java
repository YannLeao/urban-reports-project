package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.api.ApiErrorResponse;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.time.Instant;
import java.util.concurrent.Semaphore;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

/** Runs after Security and before DispatcherServlet's multipart resolution/spool. */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class MediaMultipartAdmission extends OncePerRequestFilter {
    private final Semaphore requests = new Semaphore(2);
    private final ObjectMapper mapper;
    public MediaMultipartAdmission(ObjectMapper mapper) { this.mapper = mapper; }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        // Multipart resolution precedes route/consumes matching. Gate every multipart
        // subtype, including invalid URLs, so rejected requests cannot bypass the disk bound.
        return request.getContentType() == null
            || !request.getContentType().toLowerCase(java.util.Locale.ROOT).startsWith("multipart/");
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        if (!requests.tryAcquire()) {
            response.setStatus(503); response.setContentType("application/json"); response.setHeader("Cache-Control", "no-store");
            mapper.writeValue(response.getOutputStream(), new ApiErrorResponse(Instant.now(),503,"Service Unavailable",
                "O envio de mídia está ocupado. Tente novamente.",request.getRequestURI(),"MEDIA_BUSY",null));
            return;
        }
        try { chain.doFilter(request,response); }
        finally { requests.release(); }
    }
}
