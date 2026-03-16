-- Migration: add tiebreaker_total column to entries
-- Run this in the Supabase SQL Editor.

ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS tiebreaker_total INTEGER;

-- Update the leaderboard view to include tiebreaker_total
CREATE OR REPLACE VIEW leaderboard AS
WITH entry_scores AS (
  SELECT
    e.id as entry_id,
    e.participant_name,
    e.paid,
    e.tiebreaker_total,
    ep.team_id,
    t.name as team_name,
    t.seed as team_seed,
    gr.round,
    lt.seed as opponent_seed,
    CASE
      WHEN gr.round = 1 THEN 1
      WHEN gr.round = 2 THEN 2
      WHEN gr.round = 3 THEN 4
      WHEN gr.round = 4 THEN 6
      WHEN gr.round = 5 THEN 10
      WHEN gr.round = 6 THEN 20
    END as base_points,
    CASE
      WHEN t.seed > lt.seed THEN true
      ELSE false
    END as is_upset
  FROM entries e
  JOIN entry_picks ep ON ep.entry_id = e.id
  JOIN teams t ON t.id = ep.team_id
  JOIN game_results gr ON gr.winning_team_id = ep.team_id
  JOIN teams lt ON lt.id = gr.losing_team_id
)
SELECT
  entry_id,
  participant_name,
  paid,
  tiebreaker_total,
  SUM(
    CASE WHEN is_upset THEN base_points * 2 ELSE base_points END
  ) as total_points,
  COUNT(*) as total_wins,
  COUNT(*) FILTER (WHERE is_upset) as upset_count
FROM entry_scores
GROUP BY entry_id, participant_name, paid, tiebreaker_total
ORDER BY total_points DESC;
