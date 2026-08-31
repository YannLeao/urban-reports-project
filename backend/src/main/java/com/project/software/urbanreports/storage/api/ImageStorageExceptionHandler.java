package com.project.software.urbanreports.storage.api;

import com.project.software.urbanreports.storage.application.ImageNotFoundException;
import com.project.software.urbanreports.storage.application.ImageStorageException;
import com.project.software.urbanreports.storage.application.InvalidImageException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

import java.time.Instant;

@RestControllerAdvice(assignableTypes = ImageStorageController.class)
public class ImageStorageExceptionHandler {

    @ExceptionHandler(InvalidImageException.class)
    ResponseEntity<ApiErrorResponse> invalidImage(InvalidImageException exception, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, exception.getMessage(), request);
    }

    @ExceptionHandler({MissingServletRequestPartException.class, MissingServletRequestParameterException.class})
    ResponseEntity<ApiErrorResponse> missingFile(Exception exception, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "Multipart field 'file' is required", request);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ApiErrorResponse> multipartTooLarge(MaxUploadSizeExceededException exception,
                                                        HttpServletRequest request) {
        return error(HttpStatus.CONTENT_TOO_LARGE, "Multipart request is too large", request);
    }

    @ExceptionHandler(ImageNotFoundException.class)
    ResponseEntity<ApiErrorResponse> notFound(ImageNotFoundException exception, HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "Image was not found", request);
    }

    @ExceptionHandler(ImageStorageException.class)
    ResponseEntity<ApiErrorResponse> storageFailure(ImageStorageException exception, HttpServletRequest request) {
        return error(HttpStatus.BAD_GATEWAY, "Image storage is temporarily unavailable", request);
    }

    private ResponseEntity<ApiErrorResponse> error(HttpStatus status, String message, HttpServletRequest request) {
        return ResponseEntity.status(status).body(new ApiErrorResponse(
                Instant.now(), status.value(), status.getReasonPhrase(), message, request.getRequestURI()));
    }
}
