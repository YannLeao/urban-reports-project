package com.project.software.urbanreports.api;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Set;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import tools.jackson.databind.*;

@Component
public class BoundedJsonInput {
    private final ObjectMapper mapper;
    public BoundedJsonInput(ObjectMapper mapper) { this.mapper = mapper; }
    public JsonNode read(HttpServletRequest request, Set<String> allowed) throws IOException, HttpMediaTypeNotSupportedException {
        try {
            var type = MediaType.parseMediaType(request.getContentType() == null ? "application/octet-stream" : request.getContentType());
            if (!type.getType().equals("application") || !type.getSubtype().equals("json"))
                throw new HttpMediaTypeNotSupportedException("JSON required");
        } catch (org.springframework.http.InvalidMediaTypeException invalid) { throw new HttpMediaTypeNotSupportedException("JSON required"); }
        byte[] bytes = request.getInputStream().readNBytes(8193);
        if (bytes.length > 8192) throw new IllegalArgumentException();
        var json = mapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(bytes);
        if (json == null || !json.isObject()) throw new IllegalArgumentException();
        for (String name : json.propertyNames()) if (!allowed.contains(name)) throw new IllegalArgumentException();
        for (String name : allowed) if (json.has(name) && !json.get(name).isString() && !json.get(name).isNull()) throw new IllegalArgumentException();
        return json;
    }
    public String text(JsonNode json, String name) {
        return json.has(name) && !json.get(name).isNull() ? json.get(name).asString() : null;
    }
}
