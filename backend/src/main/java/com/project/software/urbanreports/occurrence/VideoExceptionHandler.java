package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.api.ApiErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = {OccurrenceController.class, PublicOccurrenceController.class, ModerationController.class, OccurrenceMediaController.class})
public class VideoExceptionHandler {
    @ExceptionHandler(VideoException.class)
    ResponseEntity<ApiErrorResponse> failure(VideoException failure, HttpServletRequest request) {
        return ResponseEntity.status(failure.status).cacheControl(CacheControl.noStore()).body(new ApiErrorResponse(
            Instant.now(), failure.status.value(), failure.status.getReasonPhrase(), "Não foi possível processar o vídeo.", request.getRequestURI(), failure.code, null));
    }
}
