package com.project.software.urbanreports.notification.email;

import java.io.PrintStream;
import java.time.Clock;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Explicit one-shot command. Database credentials are accepted ONLY from private process environment. */
public final class NotificationEmailCommand {
    private NotificationEmailCommand() {}

    public static int run(String[] args, Map<String, String> environment, PrintStream out) {
        return execute(args, () -> {
            var source = new DriverManagerDataSource();
            String url = environment.get("NOTIFICATION_OPS_DB_URL");
            String username = environment.get("NOTIFICATION_OPS_DB_USERNAME");
            String password = environment.get("NOTIFICATION_OPS_DB_PASSWORD");
            if (url == null || !url.startsWith("jdbc:postgresql:") || username == null || password == null)
                throw new IllegalArgumentException();
            source.setUrl(url); source.setUsername(username); source.setPassword(password);
            var properties = new Properties();
            properties.setProperty("connectTimeout", "5"); properties.setProperty("socketTimeout", "10");
            properties.setProperty("ApplicationName", "notification-email-ops");
            source.setConnectionProperties(properties);
            return new NotificationEmailOperations(new JdbcTemplate(source), Clock.systemUTC());
        }, out);
    }

    static int execute(String[] args, Supplier<NotificationEmailOperations> operations, PrintStream out) {
        try {
            if (args.length == 0 || args.length == 1 && args[0].equals("help")) {
                out.println("counts | list [--state=STATE] [--offset=0] [--size=20]");
                out.println("reconcile --id=UUID --state=FAILED|UNCERTAIN --version=N --action=RELEASE|CONFIRM --reason=REASON");
                out.println("UNCERTAIN additionally requires --previous-attempt-stopped=true; RELEASE also --acknowledge-duplicate-risk=true");
                out.println("Private environment: NOTIFICATION_OPS_DB_URL, NOTIFICATION_OPS_DB_USERNAME, NOTIFICATION_OPS_DB_PASSWORD. Exit: 0 success, 2 arguments/configuration, 3 conflict, 4 database unavailable.");
                return 0;
            }
            var options = new HashMap<String, String>();
            for (int i = 1; i < args.length; i++) {
                String[] pair = args[i].split("=", 2);
                if (pair.length != 2 || !pair[0].startsWith("--") || options.put(pair[0].substring(2), pair[1]) != null)
                    throw new IllegalArgumentException();
            }
            switch (args[0]) {
                case "counts" -> {
                    if (!options.isEmpty()) throw new IllegalArgumentException();
                    operations.get().counts(out);
                }
                case "list" -> {
                    only(options, Set.of("state", "offset", "size"));
                    var state = options.containsKey("state") ? NotificationEmailStore.State.valueOf(options.get("state")) : null;
                    int offset = Integer.parseInt(options.getOrDefault("offset", "0"));
                    int size = Integer.parseInt(options.getOrDefault("size", "20"));
                    if (offset < 0 || offset > 1000000 || size < 1 || size > 100) throw new IllegalArgumentException();
                    operations.get().list(state, offset, size, out);
                }
                case "reconcile" -> {
                    only(options, Set.of("id", "state", "version", "action", "reason", "previous-attempt-stopped", "acknowledge-duplicate-risk"));
                    var id = UUID.fromString(required(options, "id"));
                    var state = NotificationEmailStore.State.valueOf(required(options, "state"));
                    long version = Long.parseLong(required(options, "version"));
                    var action = NotificationEmailOperations.Action.valueOf(required(options, "action"));
                    var reason = NotificationEmailOperations.Reason.valueOf(required(options, "reason"));
                    boolean stopped = flag(options, "previous-attempt-stopped");
                    boolean risk = flag(options, "acknowledge-duplicate-risk");
                    NotificationEmailOperations.validateReconciliation(state, version, action, reason, stopped, risk);
                    boolean changed = operations.get().reconcile(id, state, version, action, reason, stopped, risk);
                    out.println(changed ? "UPDATED 1" : "CONFLICT 0");
                    return changed ? 0 : 3;
                }
                default -> throw new IllegalArgumentException();
            }
            return 0;
        } catch (IllegalArgumentException invalid) { out.println("Invalid arguments or private database configuration; use help."); return 2; }
        catch (RuntimeException unavailable) { out.println("Database operation unavailable; no result confirmed. Consult state before repeating."); return 4; }
    }

    private static void only(Map<String, String> options, Set<String> allowed) {
        if (!allowed.containsAll(options.keySet())) throw new IllegalArgumentException();
    }
    private static String required(Map<String, String> options, String key) {
        if (!options.containsKey(key)) throw new IllegalArgumentException();
        return options.get(key);
    }
    private static boolean flag(Map<String, String> options, String key) {
        String value = options.getOrDefault(key, "false");
        if (!value.equals("true") && !value.equals("false")) throw new IllegalArgumentException();
        return Boolean.parseBoolean(value);
    }
}
