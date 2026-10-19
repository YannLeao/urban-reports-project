package com.project.software.urbanreports.api;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;

/** Multipart parsing may fail before a controller has been selected. */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class MultipartExceptionHandler {
    @ExceptionHandler(MultipartException.class)
    ResponseEntity<ApiErrorResponse> invalid(MultipartException exception, HttpServletRequest request) {
        boolean oversized = exception instanceof MaxUploadSizeExceededException;
        int status = oversized ? 413 : 400;
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(new ApiErrorResponse(
                Instant.now(), status, oversized ? "Content Too Large" : "Bad Request",
                oversized ? "Envie de 1 a 5 fotos de até 5 MiB (5.242.880 bytes) cada; a requisição completa deve ter até 26 MiB e no máximo 20 partes."
                        : "Multipart inválido. Envie os campos e de 1 a 5 fotografias.",
                request.getRequestURI(), oversized ? "IMAGE_TOO_LARGE" : "INVALID_REQUEST", null));
    }
}
