package com.project.software.urbanreports.occurrence;

import java.util.*;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/** Bounded, strict final collection. Storage identities never enter the HTTP contract. */
public record MediaManifest(List<Item> items) {
    public record Item(UUID id, Integer uploadIndex) {}
    static OccurrenceValidationException invalid() {
        return new OccurrenceValidationException(Map.of("media", List.of("Informe de 1 a 5 fotos, sem IDs ou índices repetidos; use todos os novos arquivos uma vez.")));
    }
    static MediaManifest parse(byte[] bytes) {
        try {
            if (bytes.length > 8192) throw invalid();
            var mapper = JsonMapper.builder(JsonFactory.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build()).build();
            var json = mapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(bytes);
            if (!json.isObject() || !json.propertyNames().equals(Set.of("items")) || !json.get("items").isArray()) throw invalid();
            var items = new ArrayList<Item>();
            for (var node : json.get("items")) {
                if (!node.isObject() || node.size() != 1) throw invalid();
                if (node.has("id") && node.get("id").isString()) {
                    String value = node.get("id").asString();
                    UUID id = UUID.fromString(value);
                    if (!id.toString().equals(value)) throw invalid();
                    items.add(new Item(id, null));
                } else if (node.has("uploadIndex") && node.get("uploadIndex").isIntegralNumber()
                        && node.get("uploadIndex").canConvertToInt()) {
                    items.add(new Item(null, node.get("uploadIndex").asInt()));
                } else throw invalid();
            }
            return new MediaManifest(List.copyOf(items));
        } catch (RuntimeException failure) { throw invalid(); }
    }
    void validate(Collection<UUID> currentIds, int uploads) {
        if (items.isEmpty() || items.size() > 5) throw invalid();
        Set<UUID> ids = new HashSet<>(); Set<Integer> indexes = new HashSet<>();
        for (var item : items) {
            if (item.id != null) {
                if (!currentIds.contains(item.id) || !ids.add(item.id)) throw invalid();
            } else if (item.uploadIndex == null || item.uploadIndex < 0 || item.uploadIndex >= uploads || !indexes.add(item.uploadIndex)) throw invalid();
        }
        if (indexes.size() != uploads) throw invalid();
    }
}
