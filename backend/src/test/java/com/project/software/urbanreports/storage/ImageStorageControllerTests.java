package com.project.software.urbanreports.storage;

import com.project.software.urbanreports.storage.application.ImageNotFoundException;
import com.project.software.urbanreports.storage.application.ImageStorage;
import com.project.software.urbanreports.storage.application.ImageStorageException;
import com.project.software.urbanreports.storage.application.ImageStorageService;
import com.project.software.urbanreports.storage.application.StoredImage;
import com.project.software.urbanreports.storage.application.StoredImageContent;
import com.project.software.urbanreports.storage.api.ImageStorageController;
import com.project.software.urbanreports.storage.api.ImageStorageExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ImageStorageController.class)
@Import({ImageStorageService.class, ImageStorageExceptionHandler.class,
        ImageStorageControllerTests.FakeStorageConfiguration.class})
class ImageStorageControllerTests {

    private static final String FIXED_UUID = "8647f040-61e1-4ccc-a759-925308610a87";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private FakeImageStorage imageStorage;

    @BeforeEach
    void resetStorage() {
        imageStorage.reset();
    }

    @ParameterizedTest
    @MethodSource("validImages")
    void shouldStoreSupportedImage(String contentType, byte[] bytes, String extension) throws Exception {
        var file = new MockMultipartFile("file", "external-name.exe", contentType, bytes);

        mockMvc.perform(multipart("/api/storage/images").file(file))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location",
                        "http://localhost/api/storage/images/" + FIXED_UUID + "." + extension))
                .andExpect(jsonPath("$.id").value(FIXED_UUID + "." + extension))
                .andExpect(jsonPath("$.url").value("/api/storage/images/" + FIXED_UUID + "." + extension));

        assertThat(imageStorage.storeInvocations).isEqualTo(1);
        assertThat(imageStorage.lastKey).doesNotContain("external-name");
    }

    @Test
    void shouldRejectEmptyFile() throws Exception {
        assertBadRequest(new MockMultipartFile("file", "empty.jpg", "image/jpeg", new byte[0]));
    }

    @Test
    void shouldRejectImageLargerThanFiveMegabytes() throws Exception {
        byte[] bytes = new byte[(5 * 1024 * 1024) + 1];
        bytes[0] = (byte) 0xFF;
        bytes[1] = (byte) 0xD8;
        bytes[2] = (byte) 0xFF;
        assertBadRequest(new MockMultipartFile("file", "large.jpg", "image/jpeg", bytes));
    }

    @Test
    void shouldRejectUnsupportedDeclaredMediaType() throws Exception {
        assertBadRequest(new MockMultipartFile("file", "image.gif", "image/gif", "GIF89a".getBytes()));
    }

    @Test
    void shouldRejectContentThatDoesNotMatchDeclaredMediaType() throws Exception {
        assertBadRequest(new MockMultipartFile("file", "fake.png", "image/png", jpeg()));
    }

    @Test
    void shouldRejectUnknownContentEvenWithAllowedMediaType() throws Exception {
        assertBadRequest(new MockMultipartFile("file", "text.jpg", "image/jpeg", "not an image".getBytes()));
    }

    @Test
    void shouldReturnStoredImageThroughBackend() throws Exception {
        byte[] bytes = png();
        String id = FIXED_UUID + ".png";
        imageStorage.images.put("proofs/" + id,
                new StoredImageContent(bytes, bytes.length, MediaType.IMAGE_PNG_VALUE));

        mockMvc.perform(get("/api/storage/images/{id}", id))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andExpect(content().bytes(bytes));
    }

    @Test
    void shouldReturnNotFoundForUnknownIdentifier() throws Exception {
        mockMvc.perform(get("/api/storage/images/{id}", UUID.randomUUID() + ".webp"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Image was not found"));
    }

    @Test
    void shouldNotExposeStorageDetailsWhenProviderFails() throws Exception {
        imageStorage.fail = true;
        var file = new MockMultipartFile("file", "photo.jpg", "image/jpeg", jpeg());

        String response = mockMvc.perform(multipart("/api/storage/images").file(file))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.message").value("Image storage is temporarily unavailable"))
                .andReturn().getResponse().getContentAsString();

        assertThat(response).doesNotContain("secret", "access-key", "R2 internal failure");
    }

    private void assertBadRequest(MockMultipartFile file) throws Exception {
        mockMvc.perform(multipart("/api/storage/images").file(file))
                .andExpect(status().isBadRequest());
        assertThat(imageStorage.storeInvocations).isZero();
    }

    private static Stream<Arguments> validImages() {
        return Stream.of(
                Arguments.of("image/jpeg", jpeg(), "jpg"),
                Arguments.of("image/png", png(), "png"),
                Arguments.of("image/webp", webp(), "webp")
        );
    }

    private static byte[] jpeg() {
        return Base64.getDecoder().decode(
                "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==");
    }

    private static byte[] png() {
        return Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
    }

    private static byte[] webp() {
        return Base64.getDecoder().decode(
                "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==");
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeStorageConfiguration {

        @Bean
        FakeImageStorage fakeImageStorage() {
            return new FakeImageStorage();
        }
    }

    static final class FakeImageStorage implements ImageStorage {
        private final Map<String, StoredImageContent> images = new HashMap<>();
        private int storeInvocations;
        private String lastKey;
        private boolean fail;

        @Override
        public StoredImage store(InputStream content, long contentLength, String contentType) {
            storeInvocations++;
            if (fail) {
                throw new ImageStorageException("R2 internal failure: secret=should-never-leak");
            }
            String extension = switch (contentType) {
                case "image/jpeg" -> "jpg";
                case "image/png" -> "png";
                case "image/webp" -> "webp";
                default -> throw new IllegalArgumentException(contentType);
            };
            lastKey = "proofs/" + FIXED_UUID + "." + extension;
            try {
                byte[] bytes = content.readAllBytes();
                images.put(lastKey, new StoredImageContent(bytes, contentLength, contentType));
            } catch (IOException exception) {
                throw new ImageStorageException("Fake could not read content", exception);
            }
            return new StoredImage(lastKey);
        }

        @Override
        public StoredImageContent load(String key) {
            StoredImageContent image = images.get(key);
            if (image == null) {
                throw new ImageNotFoundException(key);
            }
            return image;
        }

        void reset() {
            images.clear();
            storeInvocations = 0;
            lastKey = null;
            fail = false;
        }
    }
}
