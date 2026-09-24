package com.project.software.urbanreports.occurrence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "occurrence_categories")
public class OccurrenceCategory {
    @Id
    private Integer id;
    @Column(nullable = false, length = 80)
    private String name;

    protected OccurrenceCategory() {}

    public Integer getId() { return id; }
    public String getName() { return name; }
}
