-- Migration: add picks_reveal_at setting + update year to 2026
-- Run this in the Supabase SQL Editor.

-- Add the picks_reveal_at setting (tournament start = March 19, 2026 10am CT = 15:00 UTC)
INSERT INTO settings (key, value)
VALUES ('picks_reveal_at', '"2026-03-19T15:00:00Z"')
ON CONFLICT (key) DO NOTHING;

-- Update contest year to 2026
UPDATE settings SET value = '2026' WHERE key = 'contest_year';

-- Update entry deadline to 2026 (day before tournament starts, midnight CT = 05:00 UTC)
UPDATE settings SET value = '"2026-03-19T04:59:59Z"' WHERE key = 'entry_deadline';
