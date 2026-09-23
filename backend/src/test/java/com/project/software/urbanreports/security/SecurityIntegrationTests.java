package com.project.software.urbanreports.security;

import com.project.software.urbanreports.storage.application.ImageStorage;
import com.project.software.urbanreports.support.TestcontainersConfiguration;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.RequestDispatcher;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "image.storage.endpoint=",
        "app.cors.allowed-origins=http://localhost:5173,https://frontend.example.com"})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SecurityIntegrationTests {
    private static final String IMAGE = "/api/storage/images/00000000-0000-0000-0000-000000000000.png";
    private static final String ORIGIN = "https://frontend.example.com";

    @Autowired MockMvc mvc;
    @Autowired ApplicationContext context;
    @MockitoBean ImageStorage storage;

    @AfterEach
    void noProviderAccess() {
        verifyNoInteractions(storage);
    }

    @Test
    void healthIsPublicForGetAndHeadOnly() throws Exception {
        mvc.perform(get("/api/health")).andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"UP\"}"))
                .andExpect(header().doesNotExist("Location"))
                .andExpect(header().doesNotExist("WWW-Authenticate"));
        mvc.perform(head("/api/health")).andExpect(status().isOk());
        error(mvc.perform(post("/api/health").with(csrf())), 401, "/api/health", "Authentication is required");
    }

    @Test
    void deniesAllUnlistedRoutesWithoutProvidingLogin() throws Exception {
        for (String path : new String[]{IMAGE, "/api/storage/images", "/actuator/health", "/actuator/env",
                "/api/future", "/auth/login", "/login", "/logout", "/error", "/webjars/other/file.js"}) {
            error(mvc.perform(get(path)), 401, path, "Authentication is required");
        }
        assertThat(context.getBeansOfType(UserDetailsService.class)).isEmpty();
    }

    @Test
    void simulatedIdentityStillHasNoPermission() throws Exception {
        error(mvc.perform(get(IMAGE).with(user("synthetic"))), 403, IMAGE, "Access is denied");
        error(mvc.perform(post("/api/storage/images").with(user("synthetic")).with(csrf())),
                403, "/api/storage/images", "Access is denied");
    }

    @Test
    void bearerOnlyMutationsDoNotRequireCsrf() throws Exception {
        error(mvc.perform(post("/api/storage/images")), 401, "/api/storage/images", "Authentication is required");
        error(mvc.perform(post("/api/storage/images").with(csrf().useInvalidToken())),
                401, "/api/storage/images", "Authentication is required");
        error(mvc.perform(post("/api/storage/images").with(csrf())),
                401, "/api/storage/images", "Authentication is required");
    }

    @Test
    void bearerBasicAndSessionDoNotAuthenticate() throws Exception {
        error(mvc.perform(get(IMAGE).header("Authorization", "Bearer arbitrary-test-token")),
                401, IMAGE, "Authentication is required");
        error(mvc.perform(get(IMAGE).with(httpBasic("user", "synthetic"))),
                401, IMAGE, "Authentication is required");
        var session = new MockHttpSession();
        session.setAttribute("SPRING_SECURITY_CONTEXT", new SecurityContextImpl(
                UsernamePasswordAuthenticationToken.authenticated("synthetic", null, java.util.List.of())));
        error(mvc.perform(get(IMAGE).session(session)), 401, IMAGE, "Authentication is required");
    }

    @Test
    void allowedOriginsCanReadSecurityFailures() throws Exception {
        for (String origin : new String[]{ORIGIN, "http://localhost:5173"}) {
            error(mvc.perform(get(IMAGE).header("Origin", origin)), 401, IMAGE, "Authentication is required")
                    .andExpect(header().string("Access-Control-Allow-Origin", origin))
                    .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
            error(mvc.perform(post("/api/storage/images").header("Origin", origin)),
                    401, "/api/storage/images", "Authentication is required")
                    .andExpect(header().string("Access-Control-Allow-Origin", origin));
            error(mvc.perform(get(IMAGE).with(user("synthetic")).header("Origin", origin)),
                    403, IMAGE, "Access is denied")
                    .andExpect(header().string("Access-Control-Allow-Origin", origin));
        }
    }

    @Test
    void preflightIsProcessedBeforeAuthenticationAndCsrf() throws Exception {
        mvc.perform(options("/api/storage/images").header("Origin", ORIGIN)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "Authorization, Content-Type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ORIGIN))
                .andExpect(header().string("Access-Control-Allow-Headers", "Authorization, Content-Type"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
        mvc.perform(options(IMAGE).header("Origin", ORIGIN)
                        .header("Access-Control-Request-Method", "TRACE"))
                .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        mvc.perform(options(IMAGE).header("Origin", ORIGIN)
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "X-Unapproved"))
                .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void rejectedOriginsReceiveNoReadPermission() throws Exception {
        mvc.perform(get(IMAGE).header("Origin", "https://untrusted.example.com"))
                .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        mvc.perform(options(IMAGE).header("Origin", "https://untrusted.example.com")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void errorDispatchPreservesOriginalStatus() throws Exception {
        mvc.perform(get("/error").with(request -> { request.setDispatcherType(DispatcherType.ERROR); return request; })
                        .requestAttr(RequestDispatcher.ERROR_STATUS_CODE, 404)
                        .requestAttr(RequestDispatcher.ERROR_REQUEST_URI, "/swagger-ui/missing.js")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.status").value(404))
                .andExpect(header().doesNotExist("Location"));
    }

    private ResultActions error(ResultActions result, int status, String path, String message) throws Exception {
        return result.andExpect(status().is(status))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.timestamp").isNotEmpty()).andExpect(jsonPath("$.status").value(status))
                .andExpect(jsonPath("$.error").value(status == 401 ? "Unauthorized" : "Forbidden"))
                .andExpect(jsonPath("$.message").value(message)).andExpect(jsonPath("$.path").value(path))
                .andExpect(header().doesNotExist("Location"));
    }
}
