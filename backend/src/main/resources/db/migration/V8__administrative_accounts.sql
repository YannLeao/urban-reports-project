ALTER TABLE user_accounts DROP CONSTRAINT ck_user_accounts_role;
ALTER TABLE user_accounts ADD CONSTRAINT ck_user_accounts_role CHECK (role IN ('USER', 'ADMIN', 'SUPER_ADMIN'));
ALTER TABLE user_accounts ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE user_accounts ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE user_accounts ADD CONSTRAINT ck_user_accounts_status CHECK (
    (role = 'ADMIN' AND status IN ('PENDING_ACTIVATION', 'ACTIVE', 'DISABLED')) OR
    (role IN ('USER', 'SUPER_ADMIN') AND status = 'ACTIVE'));
ALTER TABLE user_accounts ADD CONSTRAINT ck_user_accounts_credential CHECK (
    (status = 'PENDING_ACTIVATION' AND password_hash IS NULL) OR
    (status = 'ACTIVE' AND password_hash IS NOT NULL) OR status = 'DISABLED');
CREATE UNIQUE INDEX uk_first_super_admin ON user_accounts(role) WHERE role = 'SUPER_ADMIN';
CREATE TABLE administrative_bootstrap_guard (id INTEGER PRIMARY KEY CHECK (id = 1));
INSERT INTO administrative_bootstrap_guard VALUES (1);

CREATE TABLE admin_activation_tokens (
    token_hash CHAR(64) PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    CHECK (expires_at = created_at + INTERVAL '24 hours')
);
CREATE INDEX ix_admin_activation_account ON admin_activation_tokens(account_id);
