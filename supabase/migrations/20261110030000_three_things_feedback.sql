-- Simple opt-in feedback on existing Three Things history.
-- NULL means no reaction recorded, whereas neutral is an explicit reaction.
ALTER TABLE public.three_things
 ADD COLUMN feedback text
 CHECK (feedback IS NULL OR feedback IN ('positive','neutral','negative'));

-- Reuse the existing owner-scoped SELECT and UPDATE RLS policies.
-- No derived scores, automatic reaction inference or task lifecycle changes.
