package com.project.software.urbanreports.occurrence;

import java.util.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.MultiValueMap;

/** Effective criteria: context constraints are always ANDed with optional filters. */
public record OccurrenceFilters(Integer categoryId, OccurrenceStatus status, Scope scope) {
    public enum Scope { QUEUE, ALL }
    public enum Context { PUBLIC, OWN, ADMIN }
    public static final List<OccurrenceStatus> PUBLIC_STATES = List.of(
            OccurrenceStatus.PENDING, OccurrenceStatus.IN_ANALYSIS, OccurrenceStatus.RESOLVED);
    public static final List<OccurrenceStatus> QUEUE_STATES = List.of(OccurrenceStatus.PENDING, OccurrenceStatus.IN_ANALYSIS);
    public static OccurrenceFilters empty() { return new OccurrenceFilters(null, null, Scope.QUEUE); }

    public static OccurrenceFilters parse(MultiValueMap<String, String> params, Context context,
            OccurrenceCategoryRepository categories) {
        Integer category = null;
        OccurrenceStatus state = null;
        Scope scope = Scope.QUEUE;
        for (String key : List.of("categoryId", "status", "scope", "page", "size")) {
            var values = params.get(key);
            if (values != null && (values.size() != 1 || values.getFirst().isBlank())) throw invalid(key);
        }
        try {
            if (params.containsKey("scope")) {
                if (context != Context.ADMIN) throw invalid("scope");
                scope = Scope.valueOf(params.getFirst("scope"));
            }
        } catch (IllegalArgumentException ex) { throw invalid("scope"); }
        try {
            if (params.containsKey("categoryId")) {
                String raw = params.getFirst("categoryId");
                if (!raw.matches("[0-9]+")) throw invalid("categoryId");
                category = Integer.valueOf(raw);
                if (!categories.existsById(category)) throw invalid("categoryId");
            }
        } catch (IllegalArgumentException ex) { throw invalid("categoryId"); }
        try {
            if (params.containsKey("status")) state = OccurrenceStatus.valueOf(params.getFirst("status"));
        } catch (IllegalArgumentException ex) { throw invalid("status"); }
        if (state != null && !states(context, scope).contains(state)) throw invalid("status");
        return new OccurrenceFilters(category, state, scope);
    }
    public static OccurrenceValidationException invalid(String field) {
        return new OccurrenceValidationException(Map.of(field, List.of("Invalid value")));
    }
    public static List<OccurrenceStatus> states(Context context, Scope scope) {
        return context == Context.PUBLIC ? PUBLIC_STATES : context == Context.ADMIN && scope == Scope.QUEUE
                ? QUEUE_STATES : List.of(OccurrenceStatus.values());
    }
    public Specification<Occurrence> specification(Context context, UUID authorId) {
        return (root, query, builder) -> {
            var criteria = new ArrayList<jakarta.persistence.criteria.Predicate>();
            criteria.add(root.get("status").in(states(context, scope)));
            if (context == Context.OWN) criteria.add(builder.equal(root.get("authorId"), Objects.requireNonNull(authorId)));
            if (categoryId != null) criteria.add(builder.equal(root.get("category").get("id"), categoryId));
            if (status != null) criteria.add(builder.equal(root.get("status"), status));
            return builder.and(criteria.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
    }
}
