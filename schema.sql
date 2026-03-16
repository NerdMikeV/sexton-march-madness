-- ============================================================
-- Sexton March Madness 2025 — Complete Database Schema
-- Run this entire file in the Supabase SQL Editor
-- BEFORE running: search for the admin emails and update them
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  seed INTEGER NOT NULL CHECK (seed BETWEEN 1 AND 16),
  region TEXT NOT NULL CHECK (region IN ('East', 'West', 'South', 'Midwest')),
  is_eliminated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(seed, region)
);

CREATE TABLE IF NOT EXISTS entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_name TEXT NOT NULL,
  participant_email TEXT,  -- NOT UNIQUE: multiple entries per email are allowed ($25 each)
  paid BOOLEAN DEFAULT false,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  tiebreaker_total INTEGER  -- predicted total combined score in the championship game
);

CREATE TABLE IF NOT EXISTS entry_picks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID REFERENCES entries(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id),
  UNIQUE(entry_id, team_id)
);

CREATE TABLE IF NOT EXISTS game_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  winning_team_id UUID REFERENCES teams(id) NOT NULL,
  losing_team_id UUID REFERENCES teams(id) NOT NULL,
  round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 6),
  entered_at TIMESTAMPTZ DEFAULT now(),
  entered_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- ============================================================
-- SEED VALIDATION TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION validate_entry_picks()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM entry_picks ep
    JOIN teams t ON t.id = ep.team_id
    WHERE ep.entry_id = NEW.entry_id
    AND t.seed = (SELECT seed FROM teams WHERE id = NEW.team_id)
    AND ep.id != COALESCE(NEW.id, gen_random_uuid())
  ) THEN
    RAISE EXCEPTION 'Cannot pick two teams with the same seed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_entry_picks ON entry_picks;
CREATE TRIGGER check_entry_picks
  BEFORE INSERT OR UPDATE ON entry_picks
  FOR EACH ROW EXECUTE FUNCTION validate_entry_picks();

-- ============================================================
-- LEADERBOARD VIEW
-- ============================================================

CREATE OR REPLACE VIEW leaderboard AS
WITH entry_scores AS (
  SELECT
    e.id as entry_id,
    e.participant_name,
    e.paid,
    e.tiebreaker_total,
    e.submitted_at,
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
  submitted_at,
  SUM(
    CASE WHEN is_upset THEN base_points * 2 ELSE base_points END
  ) as total_points,
  COUNT(*) as total_wins,
  COUNT(*) FILTER (WHERE is_upset) as upset_count
FROM entry_scores
GROUP BY entry_id, participant_name, paid, tiebreaker_total, submitted_at
ORDER BY total_points DESC;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Helper function to check admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins WHERE email = auth.email()
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      (SELECT value FROM settings WHERE key = 'admin_emails')
    ) AS elem
    WHERE elem->>'email' = auth.email()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Teams policies
DROP POLICY IF EXISTS "Anyone can read teams" ON teams;
CREATE POLICY "Anyone can read teams" ON teams FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage teams" ON teams;
CREATE POLICY "Admins can manage teams" ON teams FOR ALL USING (is_admin());

-- Entries policies
DROP POLICY IF EXISTS "Anyone can read entries" ON entries;
CREATE POLICY "Anyone can read entries" ON entries FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can submit entries" ON entries;
CREATE POLICY "Anyone can submit entries" ON entries FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can update entries" ON entries;
CREATE POLICY "Admins can update entries" ON entries FOR UPDATE USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete entries" ON entries;
CREATE POLICY "Admins can delete entries" ON entries FOR DELETE USING (is_admin());

-- Entry picks policies
DROP POLICY IF EXISTS "Anyone can read entry picks" ON entry_picks;
CREATE POLICY "Anyone can read entry picks" ON entry_picks FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert entry picks" ON entry_picks;
CREATE POLICY "Anyone can insert entry picks" ON entry_picks FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can delete entry picks" ON entry_picks;
CREATE POLICY "Admins can delete entry picks" ON entry_picks FOR DELETE USING (is_admin());

-- Game results policies
DROP POLICY IF EXISTS "Anyone can read game results" ON game_results;
CREATE POLICY "Anyone can read game results" ON game_results FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage game results" ON game_results;
CREATE POLICY "Admins can manage game results" ON game_results FOR ALL USING (is_admin());

-- Settings policies
DROP POLICY IF EXISTS "Anyone can read settings" ON settings;
CREATE POLICY "Anyone can read settings" ON settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage settings" ON settings;
CREATE POLICY "Admins can manage settings" ON settings FOR ALL USING (is_admin());

-- Admins policies
DROP POLICY IF EXISTS "Anyone can read admins" ON admins;
CREATE POLICY "Anyone can read admins" ON admins FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage admins" ON admins;
CREATE POLICY "Admins can manage admins" ON admins FOR ALL USING (is_admin());

-- ============================================================
-- SETTINGS SEED DATA
-- UPDATE THE EMAIL ADDRESSES BELOW BEFORE RUNNING!
-- ============================================================

INSERT INTO settings (key, value) VALUES
  ('entry_deadline', '"2026-03-19T04:59:59Z"'),
  ('contest_year', '2026'),
  ('picks_reveal_at', '"2026-03-19T15:00:00Z"'),
  ('admin_emails', '[{"email":"michael@example.com"},{"email":"taylor@example.com"}]')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ADMINS TABLE SEED DATA
-- UPDATE WITH REAL EMAILS BEFORE RUNNING!
-- ============================================================

INSERT INTO admins (email) VALUES
  ('michael@example.com'),
  ('taylor@example.com')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- TEAM SEED DATA — 2025 NCAA Tournament (all 64 teams)
-- ============================================================

INSERT INTO teams (seed, name, region) VALUES
  -- South Region
  (1,  'Auburn',          'South'),
  (2,  'Michigan State',  'South'),
  (3,  'Iowa State',      'South'),
  (4,  'Texas A&M',       'South'),
  (5,  'Michigan',        'South'),
  (6,  'North Carolina',  'South'),
  (7,  'Marquette',       'South'),
  (8,  'Louisville',      'South'),
  (9,  'Creighton',       'South'),
  (10, 'New Mexico',      'South'),
  (11, 'Ole Miss',        'South'),
  (12, 'UC San Diego',    'South'),
  (13, 'Yale',            'South'),
  (14, 'Lipscomb',        'South'),
  (15, 'Bryant',          'South'),
  (16, 'Alabama State',   'South'),

  -- East Region
  (1,  'Duke',              'East'),
  (2,  'Alabama',           'East'),
  (3,  'Wisconsin',         'East'),
  (4,  'Arizona',           'East'),
  (5,  'Oregon',            'East'),
  (6,  'BYU',               'East'),
  (7,  'Saint Mary''s',     'East'),
  (8,  'Baylor',            'East'),
  (9,  'Mississippi State', 'East'),
  (10, 'Vanderbilt',        'East'),
  (11, 'VCU',               'East'),
  (12, 'Liberty',           'East'),
  (13, 'Akron',             'East'),
  (14, 'Montana',           'East'),
  (15, 'Robert Morris',     'East'),
  (16, 'Mount St. Mary''s', 'East'),

  -- Midwest Region
  (1,  'Houston',          'Midwest'),
  (2,  'Tennessee',        'Midwest'),
  (3,  'Kentucky',         'Midwest'),
  (4,  'Purdue',           'Midwest'),
  (5,  'Clemson',          'Midwest'),
  (6,  'Xavier',           'Midwest'),
  (7,  'UCLA',             'Midwest'),
  (8,  'Georgia',          'Midwest'),
  (9,  'Gonzaga',          'Midwest'),
  (10, 'Utah State',       'Midwest'),
  (11, 'Illinois',         'Midwest'),
  (12, 'McNeese',          'Midwest'),
  (13, 'High Point',       'Midwest'),
  (14, 'Troy',             'Midwest'),
  (15, 'Wofford',          'Midwest'),
  (16, 'SIU Edwardsville', 'Midwest'),

  -- West Region
  (1,  'Florida',          'West'),
  (2,  'St. John''s',      'West'),
  (3,  'Texas Tech',       'West'),
  (4,  'Maryland',         'West'),
  (5,  'Memphis',          'West'),
  (6,  'Missouri',         'West'),
  (7,  'Kansas',           'West'),
  (8,  'UConn',            'West'),
  (9,  'Oklahoma',         'West'),
  (10, 'Arkansas',         'West'),
  (11, 'Drake',            'West'),
  (12, 'Colorado State',   'West'),
  (13, 'Grand Canyon',     'West'),
  (14, 'UNC Wilmington',   'West'),
  (15, 'Omaha',            'West'),
  (16, 'Norfolk State',    'West')
ON CONFLICT (seed, region) DO NOTHING;
