package com.project.software.urbanreports.storage.api;

import com.project.software.urbanreports.storage.application.ImageStorageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;

@RestController
@RequestMapping("/api/storage/images")
@Tag(name = "Technical image storage", description = "Temporary Sprint 1 proof using a private external bucket")
public class ImageStorageController {

    private final ImageStorageService imageStorageService;

    public ImageStorageController(ImageStorageService imageStorageService) {
        this.imageStorageService = imageStorageService;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Store a technical proof image",
            description = "Accepts one JPEG, PNG or WebP image of at most 5 MB. This is not the future occurrence endpoint.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Image stored in the private bucket"),
            @ApiResponse(responseCode = "400", description = "Empty, invalid or mismatched image",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
            @ApiResponse(responseCode = "413", description = "Multipart request exceeds the transport limit",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
            @ApiResponse(responseCode = "502", description = "External storage failure",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<UploadImageResponse> upload(
            @RequestPart("file") @Schema(type = "string", format = "binary") MultipartFile file) {
        String id = imageStorageService.store(file);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(id)
                .toUri();
        return ResponseEntity.created(location)
                .body(new UploadImageResponse(id, location.getPath()));
    }

    @GetMapping(path = "/{id}")
    @Operation(summary = "Retrieve a technical proof image",
            description = "Streams an object from the private bucket through the backend.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Stored image bytes"),
            @ApiResponse(responseCode = "404", description = "Image identifier does not exist",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
            @ApiResponse(responseCode = "502", description = "External storage failure",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<byte[]> load(@PathVariable String id) {
        var image = imageStorageService.load(id);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, image.contentType())
                .contentLength(image.contentLength())
                .body(image.content());
    }
}
