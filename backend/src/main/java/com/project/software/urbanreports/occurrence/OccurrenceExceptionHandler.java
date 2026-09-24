package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.api.ApiErrorResponse;
import com.project.software.urbanreports.storage.application.ImageStorageException;
import com.project.software.urbanreports.storage.application.InvalidImageException;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@RestControllerAdvice(assignableTypes = OccurrenceController.class)
public class OccurrenceExceptionHandler {
    @ExceptionHandler(OccurrenceValidationException.class)
    ResponseEntity<ApiErrorResponse> validation(OccurrenceValidationException exception, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", exception.fields(), request);
    }

    @ExceptionHandler(InvalidImageException.class)
    ResponseEntity<ApiErrorResponse> image(InvalidImageException exception, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", Map.of("image", List.of(exception.getMessage())), request);
    }

    @ExceptionHandler({MissingServletRequestPartException.class, MissingServletRequestParameterException.class})
    ResponseEntity<ApiErrorResponse> missing(Exception exception, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", Map.of("request", List.of("All occurrence fields and exactly one image are required")), request);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ApiErrorResponse> tooLarge(MaxUploadSizeExceededException exception, HttpServletRequest request) {
        return error(HttpStatus.CONTENT_TOO_LARGE, "IMAGE_TOO_LARGE", null, request);
    }

    @ExceptionHandler(ImageStorageException.class)
    ResponseEntity<ApiErrorResponse> storage(ImageStorageException exception, HttpServletRequest request) {
        return error(HttpStatus.BAD_GATEWAY, "IMAGE_STORAGE_UNAVAILABLE", null, request);
    }

    private ResponseEntity<ApiErrorResponse> error(HttpStatus status, String code, Map<String, List<String>> fields, HttpServletRequest request) {
        return ResponseEntity.status(status).cacheControl(org.springframework.http.CacheControl.noStore()).body(
                new ApiErrorResponse(Instant.now(), status.value(), status.getReasonPhrase(),
                        "Occurrence could not be submitted", request.getRequestURI(), code, fields));
    }
}
