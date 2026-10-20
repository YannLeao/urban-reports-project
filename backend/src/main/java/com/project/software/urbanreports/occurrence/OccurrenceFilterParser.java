package com.project.software.urbanreports.occurrence;

import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;

@Component
public class OccurrenceFilterParser {
    private final OccurrenceCategoryRepository categories;
    public OccurrenceFilterParser(OccurrenceCategoryRepository categories) { this.categories = categories; }
    public OccurrenceFilters parse(MultiValueMap<String, String> params, OccurrenceFilters.Context context) {
        return OccurrenceFilters.parse(params, context, categories);
    }
}
