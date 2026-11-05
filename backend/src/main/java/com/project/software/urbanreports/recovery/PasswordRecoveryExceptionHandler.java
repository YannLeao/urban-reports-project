package com.project.software.urbanreports.recovery;

import com.project.software.urbanreports.api.ApiErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = PasswordRecoveryController.class)
public class PasswordRecoveryExceptionHandler {
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> error(Exception error, HttpServletRequest request) {
        HttpStatus status = HttpStatus.INTERNAL_SERVER_ERROR;
        String code = "INTERNAL_ERROR";
        if (error instanceof PasswordRecoveryException failure) { status = failure.status; code = failure.code; }
        else if (error instanceof org.springframework.web.HttpMediaTypeNotSupportedException) { status = HttpStatus.UNSUPPORTED_MEDIA_TYPE; code = "UNSUPPORTED_MEDIA_TYPE"; }
        else if (error instanceof IllegalArgumentException || error instanceof tools.jackson.core.JacksonException) { status = HttpStatus.BAD_REQUEST; code = "INVALID_REQUEST"; }
        else if (error instanceof org.springframework.dao.DataAccessException || error instanceof org.springframework.transaction.TransactionException) { status = HttpStatus.SERVICE_UNAVAILABLE; code = "RECOVERY_UNAVAILABLE"; }
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(new ApiErrorResponse(
                Instant.now(), status.value(), status.getReasonPhrase(), "Request could not be completed",
                request.getRequestURI(), code, null));
    }
}