package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.api.ApiErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = SimilarOccurrenceController.class)
class SimilarOccurrenceExceptionHandler {
    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiErrorResponse> error(Exception failure, HttpServletRequest request) {
        HttpStatus status = HttpStatus.INTERNAL_SERVER_ERROR;
        String code = "INTERNAL_ERROR";
        if (failure instanceof IllegalArgumentException || failure instanceof tools.jackson.core.JacksonException
                || failure instanceof java.io.IOException) { status = HttpStatus.BAD_REQUEST; code = "INVALID_REQUEST"; }
        else if (failure instanceof OccurrenceNotFoundException) { status = HttpStatus.NOT_FOUND; code = "OCCURRENCE_NOT_FOUND"; }
        else if (failure instanceof org.springframework.dao.DataAccessException
                || failure instanceof org.springframework.transaction.TransactionException) { status = HttpStatus.SERVICE_UNAVAILABLE; code = "SIMILAR_OCCURRENCES_UNAVAILABLE"; }
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(new ApiErrorResponse(
                Instant.now(), status.value(), status.getReasonPhrase(), "Request could not be completed", request.getRequestURI(), code, null));
    }
}
