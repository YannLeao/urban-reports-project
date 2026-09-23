CREATE TABLE auth_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT ck_auth_sessions_expiry CHECK (expires_at > created_at)
);
CREATE INDEX ix_auth_sessions_user ON auth_sessions(user_id);
