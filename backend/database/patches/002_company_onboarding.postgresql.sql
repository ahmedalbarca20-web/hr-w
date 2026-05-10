ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS onboarding_last_step SMALLINT NOT NULL DEFAULT 0;

UPDATE companies SET onboarding_completed_at = NOW()
WHERE onboarding_completed_at IS NULL;
