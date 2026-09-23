package com.project.software.urbanreports.identity;

import java.io.IOException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import java.util.List;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.core.JacksonException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/auth/register")
public class RegistrationController {
    private final RegistrationService service;
    private final ObjectMapper mapper;
    static final int MAX_BODY_BYTES = 8192;

    public RegistrationController(RegistrationService service, ObjectMapper mapper) {
        this.service = service;
        this.mapper = mapper;
    }

    // Parse a bounded body here so ignored properties and chunked requests also have a limit.
    // Content-Type is checked inside the handler to retain the scoped error envelope for 415.
    @Operation(requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = RegistrationRequest.class))))
    @PostMapping(produces = "application/json")
    public ResponseEntity<RegistrationResponse> register(HttpServletRequest request) throws IOException, HttpMediaTypeNotSupportedException {
        try {
            var type = MediaType.parseMediaType(
                    request.getContentType() == null ? "application/octet-stream" : request.getContentType());
            if (!"application".equals(type.getType()) || !"json".equals(type.getSubtype())) {
                throw new HttpMediaTypeNotSupportedException(type, List.of(MediaType.APPLICATION_JSON));
            }
        } catch (InvalidMediaTypeException exception) {
            throw new HttpMediaTypeNotSupportedException("Invalid Content-Type");
        }
        byte[] body = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
        if (body.length > MAX_BODY_BYTES) throw new InvalidRegistrationRequestException();
        RegistrationRequest input;
        try {
            var json = mapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(body);
            if (json == null || !json.isObject()) throw new InvalidRegistrationRequestException();
            for (String field : new String[]{"name", "email", "password"}) {
                var value = json.get(field);
                if (value != null && !value.isNull() && !value.isString()) {
                    throw new InvalidRegistrationRequestException();
                }
            }
            input = mapper.treeToValue(json, RegistrationRequest.class);
        } catch (JacksonException exception) {
            throw new InvalidRegistrationRequestException();
        }
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service.register(input));
    }
}

class InvalidRegistrationRequestException extends RuntimeException {}
