package com.project.software.urbanreports.security;

import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import tools.jackson.databind.ObjectMapper;

@Configuration
public class SecurityConfiguration {
    private static final String[] DOCUMENTATION_PATHS = {
            "/swagger", "/swagger-ui.html", "/swagger-ui/**", "/webjars/swagger-ui/**",
            "/v3/api-docs", "/v3/api-docs.yaml", "/v3/api-docs/swagger-config"
    };

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http,
            UrlBasedCorsConfigurationSource corsConfigurationSource, ObjectMapper mapper) throws Exception {
        var errors = new SecurityErrorHandler(mapper);
        return http
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .csrf(csrf -> csrf.ignoringRequestMatchers(PathPatternRequestMatcher.withDefaults()
                        .matcher(HttpMethod.POST, "/api/auth/register")))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .rememberMe(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                // CSRF may use a session; authentication must not be loaded from one.
                .securityContext(context -> context.securityContextRepository(
                        new RequestAttributeSecurityContextRepository()))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(errors).accessDeniedHandler(errors))
                .authorizeHttpRequests(authorize -> authorize
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/health").permitAll()
                        .requestMatchers(HttpMethod.HEAD, "/api/health").permitAll()
                        .requestMatchers(HttpMethod.GET, DOCUMENTATION_PATHS).permitAll()
                        .requestMatchers(HttpMethod.HEAD, DOCUMENTATION_PATHS).permitAll()
                        .anyRequest().denyAll())
                .build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        // salt bytes, hash bytes, parallelism, memory KiB, iterations
        return new Argon2PasswordEncoder(16, 32, 1, 19456, 2);
    }
}
