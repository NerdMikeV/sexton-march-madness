-- Migration: allow multiple entries per email address
-- Run this in the Supabase SQL Editor if the entries table
-- has a unique constraint on participant_email from an earlier schema.
--
-- Multiple entries per person are allowed by contest rules ($25 each).

-- Drop unique index if it exists (Postgres may have named it either way)
DROP INDEX IF EXISTS entries_participant_email_key;
DROP INDEX IF EXISTS entries_participant_email_unique;

-- Also drop as a named constraint in case it was added via ALTER TABLE
ALTER TABLE entries
  DROP CONSTRAINT IF EXISTS entries_participant_email_key;

ALTER TABLE entries
  DROP CONSTRAINT IF EXISTS entries_participant_email_unique;
