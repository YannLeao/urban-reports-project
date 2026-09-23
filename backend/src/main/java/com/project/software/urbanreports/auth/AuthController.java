package com.project.software.urbanreports.auth;

import java.time.Clock;
import java.util.List;
import jakarta.servlet.http.HttpServletRequest;
import com.project.software.urbanreports.identity.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final LoginService login;
    private final AuthSessionRepository sessions;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final TransactionTemplate transaction;
    public AuthController(LoginService login, AuthSessionRepository sessions, ObjectMapper mapper,
            Clock clock, PlatformTransactionManager manager) {
        this.login = login; this.sessions = sessions; this.mapper = mapper; this.clock = clock;
        this.transaction = new TransactionTemplate(manager);
    }
    @PostMapping("/login")
    ResponseEntity<LoginService.Result> login(HttpServletRequest request) throws Exception {
        requireJson(request);
        byte[] body = request.getInputStream().readNBytes(8193);
        if (body.length > 8192) throw new IllegalArgumentException();
        var json = mapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(body);
        if (json == null || !json.isObject() || json.size() != 2
                || !json.has("email") || !json.get("email").isString()
                || !json.has("password") || !json.get("password").isString()) throw new IllegalArgumentException();
        String email = json.get("email").asString();
        String password = json.get("password").asString();
        if (!RegistrationValidation.validEmail(email) || password.isEmpty() || password.length() > 256)
            throw new IllegalArgumentException();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(login.login(email, password));
    }
    @GetMapping("/me")
    ResponseEntity<RegistrationResponse> me(@AuthenticationPrincipal AuthenticatedIdentity identity) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(identity.user());
    }
    @PostMapping("/logout")
    ResponseEntity<Void> logout(@AuthenticationPrincipal AuthenticatedIdentity identity, HttpServletRequest request) throws Exception {
        requireJson(request);
        transaction.executeWithoutResult(status -> sessions.revoke(identity.sessionId(), identity.userId(), clock.instant()));
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
    private static void requireJson(HttpServletRequest request) throws HttpMediaTypeNotSupportedException {
        try {
            var type = MediaType.parseMediaType(request.getContentType() == null ? "application/octet-stream" : request.getContentType());
            if (!"application".equals(type.getType()) || !"json".equals(type.getSubtype()))
                throw new HttpMediaTypeNotSupportedException(type, List.of(MediaType.APPLICATION_JSON));
        } catch (InvalidMediaTypeException exception) { throw new HttpMediaTypeNotSupportedException("Invalid Content-Type"); }
    }
}
