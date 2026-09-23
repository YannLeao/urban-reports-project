CREATE TABLE user_accounts (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(512) NOT NULL,
    role VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uk_user_accounts_email UNIQUE (email),
    CONSTRAINT ck_user_accounts_email_canonical CHECK (
        email = lower(email) AND email COLLATE "C" !~ '[^!-~]' AND length(email) > 0
    ),
    CONSTRAINT ck_user_accounts_role CHECK (role = 'USER')
);
