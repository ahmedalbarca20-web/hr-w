-- Example: create an activation code for office installer (Postgres/MySQL/SQLite compatible shape).
-- Replace company_id, agent_id, and id. Code must match what you give the customer (uppercase, no spaces).

-- Postgres / MySQL (adjust types if needed):
INSERT INTO agent_activation_codes (
  id, code, company_id, agent_id, agent_token, poll_interval_ms, expires_at, revoked_at, last_used_at, created_at, updated_at
) VALUES (
  REPLACE(UUID(), '-', ''),  -- or any 32-char hex id
  'OFFICE-ABCD1234',
  1,
  'office_1',
  NULL,                        -- NULL = use server AGENT_SHARED_TOKEN on activate
  3000,
  NULL,                        -- or '2099-12-31' for expiry
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
