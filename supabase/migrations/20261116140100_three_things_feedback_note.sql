-- BEE-THREE-01: optional written context for an existing reaction.
-- Nullable so all existing icon-only ratings and saved suggestions remain valid.
ALTER TABLE public.three_things
  ADD COLUMN IF NOT EXISTS feedback_note text;

-- Prevent unbounded prompt input and accidental oversized writes.
ALTER TABLE public.three_things
  DROP CONSTRAINT IF EXISTS three_things_feedback_note_length;
ALTER TABLE public.three_things
  ADD CONSTRAINT three_things_feedback_note_length
  CHECK (feedback_note IS NULL OR char_length(feedback_note) <= 500);

COMMENT ON COLUMN public.three_things.feedback_note IS
  'Optional explanation of positive/neutral/negative reaction; never required for icon-only feedback.';
