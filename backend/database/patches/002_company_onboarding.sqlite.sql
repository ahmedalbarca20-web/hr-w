-- Guided onboarding progress (per company). Safe to run multiple times.
ALTER TABLE companies ADD COLUMN onboarding_completed_at DATETIME NULL;
ALTER TABLE companies ADD COLUMN onboarding_last_step INTEGER NOT NULL DEFAULT 0;

-- Existing deployments: treat all current companies as already onboarded.
UPDATE companies SET onboarding_completed_at = datetime('now')
WHERE onboarding_completed_at IS NULL;
