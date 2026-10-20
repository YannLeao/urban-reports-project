package com.project.software.urbanreports.occurrence;

public class VideoProcessProbe {
    public static void main(String[] args) throws Exception {
        switch (args[0]) {
            case "environment" -> System.out.print(System.getenv().keySet().stream().sorted().toList());
            case "output" -> { for (int i = 0; i < 100000; i++) System.out.print("synthetic"); }
            case "spawn" -> {
                var child = new ProcessBuilder(System.getProperty("java.home") + "/bin/java", "-cp", System.getProperty("java.class.path"),
                    VideoProcessProbe.class.getName(), "wait").redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
                java.nio.file.Files.writeString(java.nio.file.Path.of(args[1]), Long.toString(child.pid()));
                Thread.sleep(60000);
            }
            case "wait" -> Thread.sleep(60000);
            default -> throw new IllegalArgumentException();
        }
    }
}
