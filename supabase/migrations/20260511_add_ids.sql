-- Migration: add explicit payer_uuid and participant_uuids to trip_expenses
-- Adds columns and attempts to backfill them from existing JSON payloads when possible.

ALTER TABLE public.trip_expenses
  ADD COLUMN IF NOT EXISTS payer_uuid uuid REFERENCES auth.users(id) DEFAULT NULL;

ALTER TABLE public.trip_expenses
  ADD COLUMN IF NOT EXISTS participant_uuids uuid[] DEFAULT NULL;

-- Backfill payer_uuid from payload->>'payerId' when it's a valid uuid-like string
UPDATE public.trip_expenses
SET payer_uuid = CASE
  WHEN (payload->>'payerId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    THEN (payload->>'payerId')::uuid
  ELSE NULL
END
WHERE payload ? 'payerId';

-- Backfill participant_uuids from payload->'participantIds' array when elements look like uuids
UPDATE public.trip_expenses
SET participant_uuids = (
  SELECT array_agg(val::uuid)
  FROM (
    SELECT jsonb_array_elements_text(payload->'participantIds') AS val
  ) AS t
  WHERE val ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
)
WHERE payload ? 'participantIds';

-- Note: This migration populates new columns for expenses that already include IDs in payload.
-- Further backfill strategies (resolving names/emails to IDs) should be executed in a controlled environment
-- where `user_profiles` table is available and mapping is reliable.

-- Optional: create an index to speed up queries by payer_uuid
CREATE INDEX IF NOT EXISTS idx_trip_expenses_payer_uuid ON public.trip_expenses(payer_uuid);

-- Optional: GIN index for participant_uuids
CREATE INDEX IF NOT EXISTS idx_trip_expenses_participant_uuids ON public.trip_expenses USING GIN (participant_uuids);
