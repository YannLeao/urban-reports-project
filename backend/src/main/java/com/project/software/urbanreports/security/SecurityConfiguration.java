package com.project.software.urbanreports.security;

import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import com.project.software.urbanreports.auth.SessionAuthenticationConverter;
import org.springframework.security.config.http.SessionCreationPolicy;
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
    @org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
    SecurityFilterChain securityFilterChain(HttpSecurity http,
            UrlBasedCorsConfigurationSource corsConfigurationSource, ObjectMapper mapper, SessionAuthenticationConverter converter) throws Exception {
        var errors = new SecurityErrorHandler(mapper);
        return http
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .oauth2ResourceServer(resource -> resource.jwt(jwt -> jwt.jwtAuthenticationConverter(converter::convert))
                        .authenticationEntryPoint(errors).accessDeniedHandler(errors))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .rememberMe(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                // Bearer only: never load or persist authentication in a servlet session.
                .securityContext(context -> context.securityContextRepository(
                        new RequestAttributeSecurityContextRepository()))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(errors).accessDeniedHandler(errors))
                .authorizeHttpRequests(authorize -> authorize
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login", "/api/auth/admin-activations").permitAll()
                        .requestMatchers("/api/super-admin/admins", "/api/super-admin/admins/**").hasRole("SUPER_ADMIN")
                        .requestMatchers("/api/admin/occurrences", "/api/admin/occurrences/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/admin/reports/occurrences", "/api/admin/reports/occurrences/pdf").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/auth/me").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/auth/logout").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/notifications").hasRole("USER")
                        .requestMatchers(HttpMethod.POST, "/api/notifications/*/read").hasRole("USER")
                        .requestMatchers(HttpMethod.GET, "/api/occurrence-categories").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/occurrences/similar").hasRole("USER")
                        .requestMatchers(HttpMethod.GET, "/api/occurrences", "/api/occurrences/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/occurrences").hasRole("USER")
                        .requestMatchers(HttpMethod.PUT, "/api/occurrences/*").authenticated()
                        .requestMatchers(HttpMethod.DELETE, "/api/occurrences/*").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/public/occurrences", "/api/public/occurrences/*", "/api/public/occurrences/*/image", "/api/public/occurrences/*/media/*").permitAll()
                        .requestMatchers(HttpMethod.HEAD, "/api/public/occurrences/*/media/*").permitAll()
                        .requestMatchers(HttpMethod.HEAD, "/api/occurrences/*/media/*").authenticated()
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
