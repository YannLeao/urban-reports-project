CREATE TABLE occurrence_categories (
    id INTEGER PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE
);

INSERT INTO occurrence_categories (id, name) VALUES
    (1, 'Iluminação pública'),
    (2, 'Buraco ou pavimentação'),
    (3, 'Lixo ou descarte irregular'),
    (4, 'Saneamento ou alagamento'),
    (5, 'Calçada ou acessibilidade'),
    (6, 'Sinalização ou trânsito'),
    (7, 'Árvore ou área verde'),
    (8, 'Outro');

CREATE TABLE occurrences (
    id UUID PRIMARY KEY,
    author_id UUID NOT NULL REFERENCES user_accounts(id),
    category_id INTEGER NOT NULL REFERENCES occurrence_categories(id),
    title VARCHAR(100) NOT NULL,
    description VARCHAR(1000) NOT NULL,
    neighborhood VARCHAR(100) NOT NULL,
    reference VARCHAR(200) NOT NULL,
    image_key VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_occurrences_status CHECK (status = 'PENDING'),
    CONSTRAINT ck_occurrences_title_length CHECK (char_length(title) BETWEEN 5 AND 100),
    CONSTRAINT ck_occurrences_description_length CHECK (char_length(description) BETWEEN 20 AND 1000),
    CONSTRAINT ck_occurrences_neighborhood_length CHECK (char_length(neighborhood) BETWEEN 2 AND 100),
    CONSTRAINT ck_occurrences_reference_length CHECK (char_length(reference) BETWEEN 5 AND 200)
);
CREATE INDEX ix_occurrences_author ON occurrences(author_id);
CREATE INDEX ix_occurrences_category ON occurrences(category_id);
