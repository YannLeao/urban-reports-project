package com.project.software.urbanreports.administration;

import java.util.Arrays;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "admin.bootstrap", havingValue = "true")
public class BootstrapCommand implements CommandLineRunner {
    private final BootstrapService service;
    public BootstrapCommand(BootstrapService service) { this.service = service; }
    public void run(String... args) {
        if (!Arrays.asList(args).contains("--admin.bootstrap=true")) throw new IllegalStateException("Bootstrap requires an explicit command-line flag");
        var console = System.console();
        if (console == null) throw new IllegalStateException("Bootstrap requires an interactive protected console");
        String name = console.readLine("Nome do primeiro SUPER_ADMIN: ");
        String email = console.readLine("E-mail novo: ");
        char[] password = console.readPassword("Senha (15–128 caracteres): ");
        char[] confirmation = console.readPassword("Confirme a senha: ");
        try {
            if (password == null || !Arrays.equals(password, confirmation)) throw new IllegalArgumentException("Passwords do not match");
            service.createFirst(name, email, new String(password));
            console.printf("Primeiro SUPER_ADMIN criado. Use o login normal.%n");
        } finally {
            if (password != null) Arrays.fill(password, '\0');
            if (confirmation != null) Arrays.fill(confirmation, '\0');
        }
    }
}
