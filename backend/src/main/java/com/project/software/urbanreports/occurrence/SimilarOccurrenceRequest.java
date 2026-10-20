package com.project.software.urbanreports.occurrence;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.MediaType;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

record SimilarOccurrenceRequest(int categoryId, double latitude, double longitude, UUID excludeOccurrenceId) {
    private static final Set<String> FIELDS = Set.of("categoryId", "latitude", "longitude", "excludeOccurrenceId");
    private static final JsonMapper MAPPER = JsonMapper.builder(JsonFactory.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build()).build();

    static SimilarOccurrenceRequest read(HttpServletRequest request) throws java.io.IOException {
        var type = MediaType.parseMediaType(request.getContentType() == null ? "application/octet-stream" : request.getContentType());
        if (!type.getType().equals("application") || !type.getSubtype().equals("json")
                || request.getQueryString() != null) throw new IllegalArgumentException();
        // Bound actual bytes, including chunked requests; never log body or parser exceptions.
        byte[] body = request.getInputStream().readNBytes(8193);
        if (body.length > 8192) throw new IllegalArgumentException();
        var node = MAPPER.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(body);
        if (node == null || !node.isObject() || !FIELDS.containsAll(node.propertyNames())) throw new IllegalArgumentException();
        var category = node.get("categoryId"); var lat = node.get("latitude"); var lon = node.get("longitude");
        if (category == null || !category.isIntegralNumber() || !category.canConvertToInt() || category.asInt() < 1
                || lat == null || !lat.isNumber() || lon == null || !lon.isNumber()) throw new IllegalArgumentException();
        double latitude = lat.asDouble(), longitude = lon.asDouble();
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
            throw new IllegalArgumentException();
        UUID exclude = null;
        if (node.has("excludeOccurrenceId")) {
            var value = node.get("excludeOccurrenceId");
            if (!value.isString()) throw new IllegalArgumentException();
            exclude = UUID.fromString(value.asString());
            if (!exclude.toString().equalsIgnoreCase(value.asString())) throw new IllegalArgumentException();
        }
        return new SimilarOccurrenceRequest(category.asInt(), latitude, longitude, exclude);
    }
}
