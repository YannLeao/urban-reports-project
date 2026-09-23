package com.project.software.urbanreports.auth;

import java.time.Instant;
import jakarta.servlet.http.HttpServletRequest;
import com.project.software.urbanreports.api.ApiErrorResponse;
import org.springframework.http.*;
import org.springframework.dao.DataAccessException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.annotation.*;
import tools.jackson.core.JacksonException;

@RestControllerAdvice(assignableTypes = AuthController.class)
public class AuthExceptionHandler {
    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiErrorResponse> handle(Exception exception, HttpServletRequest request) {
        HttpStatus status = HttpStatus.INTERNAL_SERVER_ERROR;
        String code = "INTERNAL_ERROR";
        if (exception instanceof BadCredentialsException) { status = HttpStatus.UNAUTHORIZED; code = "INVALID_CREDENTIALS"; }
        else if (exception instanceof IllegalArgumentException || exception instanceof JacksonException) {
            status = HttpStatus.BAD_REQUEST; code = "INVALID_REQUEST";
        } else if (exception instanceof HttpMediaTypeNotSupportedException) {
            status = HttpStatus.UNSUPPORTED_MEDIA_TYPE; code = "UNSUPPORTED_MEDIA_TYPE";
        } else if (exception instanceof DataAccessException || exception instanceof org.springframework.transaction.TransactionException) {
            status = HttpStatus.SERVICE_UNAVAILABLE; code = "AUTH_UNAVAILABLE";
        }
        var response = ResponseEntity.status(status).cacheControl(CacheControl.noStore());
        if (status == HttpStatus.UNAUTHORIZED) response.header("WWW-Authenticate", "Bearer");
        return response.body(new ApiErrorResponse(Instant.now(), status.value(), status.getReasonPhrase(),
                "Authentication request could not be completed", request.getRequestURI(), code, null));
    }
}
