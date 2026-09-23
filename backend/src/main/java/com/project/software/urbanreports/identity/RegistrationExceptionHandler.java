package com.project.software.urbanreports.identity;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.http.*;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.annotation.*;
import com.project.software.urbanreports.api.ApiErrorResponse;

@RestControllerAdvice(assignableTypes = RegistrationController.class)
public class RegistrationExceptionHandler {
    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiErrorResponse> handle(Exception exception, HttpServletRequest request) {
        HttpStatus status = HttpStatus.INTERNAL_SERVER_ERROR;
        String code = "INTERNAL_ERROR";
        Map<String, List<String>> fields = null;
        if (exception instanceof RegistrationValidationException validation) {
            status = HttpStatus.BAD_REQUEST;
            code = "VALIDATION_ERROR";
            fields = validation.fields;
        } else if (exception instanceof InvalidRegistrationRequestException) {
            status = HttpStatus.BAD_REQUEST;
            code = "INVALID_REQUEST";
        } else if (exception instanceof HttpMediaTypeNotSupportedException) {
            status = HttpStatus.UNSUPPORTED_MEDIA_TYPE;
            code = "UNSUPPORTED_MEDIA_TYPE";
        } else if (isDuplicateEmail(exception)) {
            status = HttpStatus.CONFLICT;
            code = "EMAIL_ALREADY_REGISTERED";
        }
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(
                new ApiErrorResponse(Instant.now(), status.value(), status.getReasonPhrase(),
                        "Registration could not be completed", request.getRequestURI(), code, fields));
    }

    static boolean isDuplicateEmail(Throwable exception) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException violation
                    && "23505".equals(violation.getSQLState())
                    && "uk_user_accounts_email".equals(violation.getConstraintName())) return true;
        }
        return false;
    }
}
