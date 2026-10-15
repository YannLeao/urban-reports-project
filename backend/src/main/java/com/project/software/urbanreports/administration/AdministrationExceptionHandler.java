package com.project.software.urbanreports.administration;

import com.project.software.urbanreports.api.ApiErrorResponse;
import com.project.software.urbanreports.identity.RegistrationExceptionHandler;
import com.project.software.urbanreports.occurrence.*;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = {AdminAccountsController.class, AdminActivationController.class, ModerationController.class})
public class AdministrationExceptionHandler {
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> error(Exception error, HttpServletRequest request) {
        HttpStatus status = HttpStatus.INTERNAL_SERVER_ERROR;
        String code = "INTERNAL_ERROR";
        Map<String, List<String>> fields = null;
        if (error instanceof AdministrationException failure) { status = failure.status; code = failure.code; }
        else if (error instanceof org.springframework.security.access.AccessDeniedException) { status = HttpStatus.FORBIDDEN; code = "ACCESS_DENIED"; }
        else if (error instanceof OccurrenceWriteException failure) { status = failure.status; code = failure.code; }
        else if (error instanceof OccurrenceValidationException failure) { status = HttpStatus.BAD_REQUEST; code = "VALIDATION_ERROR"; fields = failure.fields(); }
        else if (error instanceof OccurrenceNotFoundException) { status = HttpStatus.NOT_FOUND; code = "OCCURRENCE_NOT_FOUND"; }
        else if (RegistrationExceptionHandler.isDuplicateEmail(error)) { status = HttpStatus.CONFLICT; code = "EMAIL_ALREADY_REGISTERED"; }
        else if (error instanceof org.springframework.web.HttpMediaTypeNotSupportedException) { status = HttpStatus.UNSUPPORTED_MEDIA_TYPE; code = "UNSUPPORTED_MEDIA_TYPE"; }
        else if (error instanceof IllegalArgumentException || error instanceof tools.jackson.core.JacksonException
                || error instanceof org.springframework.web.method.annotation.MethodArgumentTypeMismatchException) { status = HttpStatus.BAD_REQUEST; code = "INVALID_REQUEST"; }
        else if (error instanceof com.project.software.urbanreports.storage.application.ImageNotFoundException) { status = HttpStatus.NOT_FOUND; code = "IMAGE_NOT_FOUND"; }
        else if (error instanceof com.project.software.urbanreports.storage.application.ImageStorageException) { status = HttpStatus.BAD_GATEWAY; code = "IMAGE_STORAGE_UNAVAILABLE"; }
        else if (error instanceof org.springframework.dao.DataAccessException || error instanceof org.springframework.transaction.TransactionException) { status = HttpStatus.SERVICE_UNAVAILABLE; code = "ADMINISTRATION_UNAVAILABLE"; }
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(new ApiErrorResponse(
                Instant.now(), status.value(), status.getReasonPhrase(), "Request could not be completed", request.getRequestURI(), code, fields));
    }
}
