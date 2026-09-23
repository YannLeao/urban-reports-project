package com.project.software.urbanreports.auth;

import java.nio.file.*;
import java.security.*;
import java.security.interfaces.*;
import java.security.spec.*;
import java.time.Clock;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;

@Configuration
public class JwtConfiguration {
    public record Keys(RSAPublicKey publicKey, RSAPrivateKey privateKey) {}
    public record Settings(String issuer, String audience, String keyId) {
        public Settings {
            if (issuer.isBlank() || audience.isBlank() || keyId.isBlank())
                throw new IllegalArgumentException("AUTH_JWT_ISSUER, AUDIENCE and KEY_ID are required");
        }
    }
    @Bean @ConditionalOnMissingBean
    Clock authClock() { return Clock.systemUTC(); }
    @Bean
    Settings jwtSettings(@Value("${auth.jwt.issuer}") String issuer,
            @Value("${auth.jwt.audience}") String audience, @Value("${auth.jwt.key-id}") String kid) {
        return new Settings(issuer, audience, kid);
    }
    @Bean @ConditionalOnMissingBean(Keys.class)
    Keys jwtKeys(@Value("${auth.jwt.private-key-file}") String privatePath,
            @Value("${auth.jwt.public-key-file}") String publicPath) {
        try {
            var factory = KeyFactory.getInstance("RSA");
            var privateKey = (RSAPrivateKey) factory.generatePrivate(new PKCS8EncodedKeySpec(pem(privatePath, "PRIVATE KEY")));
            var publicKey = (RSAPublicKey) factory.generatePublic(new X509EncodedKeySpec(pem(publicPath, "PUBLIC KEY")));
            if (publicKey.getModulus().bitLength() < 2048 || !publicKey.getModulus().equals(privateKey.getModulus()))
                throw new GeneralSecurityException();
            var signature = Signature.getInstance("SHA256withRSA");
            byte[] challenge = new byte[32]; new SecureRandom().nextBytes(challenge);
            signature.initSign(privateKey); signature.update(challenge); byte[] signed = signature.sign();
            signature.initVerify(publicKey); signature.update(challenge);
            if (!signature.verify(signed)) throw new GeneralSecurityException();
            return new Keys(publicKey, privateKey);
        } catch (Exception error) {
            // Do not include key contents or parser exception in startup diagnostics.
            throw new IllegalStateException("Configure readable matching RSA PEM key files (PKCS8/X509), at least 2048 bits");
        }
    }
    private static byte[] pem(String path, String label) throws Exception {
        if (path.isBlank()) throw new IllegalArgumentException();
        String text = Files.readString(Path.of(path));
        return Base64.getDecoder().decode(text.replace("-----BEGIN " + label + "-----", "")
                .replace("-----END " + label + "-----", "").replaceAll("\\s", ""));
    }
    @Bean
    JwtEncoder jwtEncoder(Keys keys, Settings settings) {
        var rsa = new RSAKey.Builder(keys.publicKey()).privateKey(keys.privateKey()).keyID(settings.keyId()).build();
        return new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(rsa)));
    }
    @Bean
    JwtDecoder jwtDecoder(Keys keys, Settings settings, Clock clock) {
        var decoder = NimbusJwtDecoder.withPublicKey(keys.publicKey()).signatureAlgorithm(SignatureAlgorithm.RS256).build();
        var defaults = MappedJwtClaimSetConverter.withDefaults(Map.of());
        decoder.setClaimSetConverter(claims -> {
            // Nimbus has already verified the signature. Prevent default coercion of identity claims.
            for (String name : List.of("iss", "sub", "jti")) {
                if (!(claims.get(name) instanceof String)) throw new BadJwtException("Invalid access token");
            }
            Object audience = claims.get("aud");
            if (!(audience instanceof List<?> list) || list.isEmpty()
                    || list.stream().anyMatch(value -> !(value instanceof String)))
                throw new BadJwtException("Invalid access token");
            for (String name : List.of("iat", "exp")) {
                if (!(claims.get(name) instanceof java.util.Date)) throw new BadJwtException("Invalid access token");
            }
            return defaults.convert(claims);
        });
        decoder.setJwtValidator(jwt -> {
            try {
                var now = clock.instant();
                boolean valid = settings.keyId().equals(jwt.getHeaders().get("kid"))
                        && settings.issuer().equals(jwt.getClaimAsString("iss"))
                        && jwt.getAudience().equals(List.of(settings.audience()))
                        && canonicalUuid(jwt.getSubject()) && canonicalUuid(jwt.getId())
                        && jwt.getIssuedAt() != null && jwt.getExpiresAt() != null
                        && !jwt.getIssuedAt().isAfter(now) && now.isBefore(jwt.getExpiresAt())
                        && jwt.getExpiresAt().equals(jwt.getIssuedAt().plusSeconds(1800))
                        && (jwt.getNotBefore() == null || !jwt.getNotBefore().isAfter(now));
                if (valid) return OAuth2TokenValidatorResult.success();
            } catch (RuntimeException ignored) { }
            return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid access token", null));
        });
        return decoder;
    }
    private static boolean canonicalUuid(String value) {
        return value != null && UUID.fromString(value).toString().equals(value);
    }
}
