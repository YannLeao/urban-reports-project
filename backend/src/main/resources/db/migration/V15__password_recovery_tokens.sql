CREATE TABLE password_recovery_tokens (
    token_hash CHAR(64) PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    CHECK (expires_at = created_at + INTERVAL '30 minutes')
);
CREATE INDEX ix_password_recovery_account ON password_recovery_tokens(account_id);