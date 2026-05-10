ALTER TABLE companies ADD COLUMN onboarding_completed_at DATETIME NULL;
ALTER TABLE companies ADD COLUMN onboarding_last_step TINYINT UNSIGNED NOT NULL DEFAULT 0;

UPDATE companies SET onboarding_completed_at = UTC_TIMESTAMP()
WHERE onboarding_completed_at IS NULL;
