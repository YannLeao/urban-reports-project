package com.project.software.urbanreports.notification;

import com.project.software.urbanreports.api.ApiErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = NotificationController.class)
public class NotificationExceptionHandler {
    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiErrorResponse> error(Exception error, HttpServletRequest request) {
        HttpStatus status = HttpStatus.INTERNAL_SERVER_ERROR;
        String code = "INTERNAL_ERROR";
        if (error instanceof ResponseStatusException failure) {
            status = HttpStatus.valueOf(failure.getStatusCode().value());
            code = status == HttpStatus.NOT_FOUND ? "NOTIFICATION_NOT_FOUND" : "INVALID_REQUEST";
        } else if (error instanceof org.springframework.security.access.AccessDeniedException) {
            status = HttpStatus.FORBIDDEN; code = "ACCESS_DENIED";
        } else if (error instanceof org.springframework.web.method.annotation.MethodArgumentTypeMismatchException) {
            status = HttpStatus.BAD_REQUEST; code = "INVALID_REQUEST";
        } else if (error instanceof org.springframework.dao.DataAccessException
                || error instanceof org.springframework.transaction.TransactionException) {
            status = HttpStatus.SERVICE_UNAVAILABLE; code = "NOTIFICATIONS_UNAVAILABLE";
        }
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(new ApiErrorResponse(
                Instant.now(), status.value(), status.getReasonPhrase(), "Request could not be completed",
                request.getRequestURI(), code, null));
    }
}
