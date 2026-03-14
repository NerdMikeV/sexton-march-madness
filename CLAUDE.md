# Sexton March Madness Contest App

## Project Overview

Build a full-stack web app for a March Madness pool contest. Participants pick 8 NCAA tournament teams (max one per seed line), earn points when their teams win, and compete on a live leaderboard. Admin users (Michael and Taylor) manage the bracket, enter game results, and track payments.

**Stack:** Next.js 14 (App Router) + Supabase (auth, DB, realtime) + Tailwind CSS  
**Deploy:** Vercel (frontend) + Supabase (hosted)  
**Repo:** Initialize as `sexton-march-madness`

---

## Contest Rules (CRITICAL — scoring logic must be exact)

### Entry Rules
- Each entry consists of exactly **8 teams**
- A participant may **NOT pick more than one team from the same seed line** (e.g., cannot pick two #1 seeds, even from different regions)
- Multiple entries per person are allowed (each is $25)
- Entry deadline: configurable by admin (default March 20, 2025 midnight)

### Scoring
When a team on your entry wins a game, you earn points for that round:

| Round | Name | Base Points |
|-------|------|-------------|
| 1 | Round of 64 | 1 |
| 2 | Round of 32 | 2 |
| 3 | Sweet 16 | 4 |
| 4 | Elite 8 | 6 |
| 5 | Final Four (win puts team in championship game) | 10 |
| 6 | Championship (win) | 20 |

### Upset Multiplier
When a **lower-seeded team beats a higher-seeded team**, the points are **DOUBLED**.

**"Lower seed" means higher seed number.** A #12 seed beating a #5 seed is an upset. A #1 seed beating a #16 seed is NOT an upset.

**Implementation:** If `winning_team.seed > losing_team.seed`, then `points = base_points * 2`, otherwise `points = base_points`.

### Prize Distribution
- 1st place: 60% of pot
- 2nd place: 25% of pot
- 3rd place: 10% of pot
- 4th place: 5% of pot
- Pot = (total entries) × $25

---

## Data Model (Supabase/PostgreSQL)

### `teams`
```sql
CREATE TABLE teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  seed INTEGER NOT NULL CHECK (seed BETWEEN 1 AND 16),
  region TEXT NOT NULL CHECK (region IN ('East', 'West', 'South', 'Midwest')),
  is_eliminated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(seed, region)  -- one team per seed per region
);
```

### `entries`
```sql
CREATE TABLE entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_name TEXT NOT NULL,
  participant_email TEXT,  -- optional, for contact
  paid BOOLEAN DEFAULT false,
  submitted_at TIMESTAMPTZ DEFAULT now()
);
```

### `entry_picks`
```sql
CREATE TABLE entry_picks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID REFERENCES entries(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id),
  UNIQUE(entry_id, team_id)
);
```

### `game_results`
This is where admin enters results as games are played. Each row = one game win.

```sql
CREATE TABLE game_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  winning_team_id UUID REFERENCES teams(id) NOT NULL,
  losing_team_id UUID REFERENCES teams(id) NOT NULL,
  round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 6),
  entered_at TIMESTAMPTZ DEFAULT now(),
  entered_by UUID REFERENCES auth.users(id)
);
```

### `settings`
```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
-- Keys: 'entry_deadline', 'contest_year', 'admin_emails'
```

### Scoring View (computed, not stored)
```sql
CREATE OR REPLACE VIEW leaderboard AS
WITH entry_scores AS (
  SELECT 
    e.id as entry_id,
    e.participant_name,
    e.paid,
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
      WHEN t.seed > lt.seed THEN true  -- winning team is lower seed (higher number) = upset
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
  SUM(
    CASE WHEN is_upset THEN base_points * 2 ELSE base_points END
  ) as total_points,
  COUNT(*) as total_wins,
  COUNT(*) FILTER (WHERE is_upset) as upset_count
FROM entry_scores
GROUP BY entry_id, participant_name, paid
ORDER BY total_points DESC;
```

### Seed Validation (DB-level constraint)
```sql
-- Function to validate no duplicate seeds per entry
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

CREATE TRIGGER check_entry_picks
  BEFORE INSERT OR UPDATE ON entry_picks
  FOR EACH ROW EXECUTE FUNCTION validate_entry_picks();

-- Also validate exactly 8 picks per entry at the application level
-- (trigger on entry submission, not individual pick inserts since they're batched)
```

---

## Auth & RLS

Use Supabase Auth (email/password or magic link — keep it simple).

### Roles
- **Admin:** Michael and Taylor. Check against `settings` table `admin_emails` key or a simple `admins` table. Admins can: enter game results, mark entries as paid, load/edit teams, delete entries.
- **Public (no auth required):** View leaderboard, submit entries. Entries don't require auth — participants just enter their name. This keeps friction minimal (mirrors the Google Forms experience).

### RLS Policies
```sql
-- Teams: public read, admin write
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read teams" ON teams FOR SELECT USING (true);
CREATE POLICY "Admins can manage teams" ON teams FOR ALL USING (
  auth.email() IN (SELECT value->>'email' FROM jsonb_array_elements((SELECT value FROM settings WHERE key = 'admin_emails')) AS value)
);

-- Entries: public read and insert, admin update/delete
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read entries" ON entries FOR SELECT USING (true);
CREATE POLICY "Anyone can submit entries" ON entries FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage entries" ON entries FOR UPDATE USING (...);
CREATE POLICY "Admins can delete entries" ON entries FOR DELETE USING (...);

-- Game results: public read, admin write
-- Leaderboard view: public read
```

---

## Pages & Features

### 1. Landing / Home Page (`/`)
- Contest name, rules summary, prize pool display
- Entry deadline countdown timer
- Quick links to Enter and Leaderboard
- Venmo/PayPal payment info (display @TaylorSextonTX and Sextonfoundation@gmail.com)
- Mobile-first, bold sports aesthetic

### 2. Submit Entry (`/enter`)
- Name field (required), optional email
- Team picker: show all 64 teams grouped by region
- Seed filter and search
- Seed usage indicator: show which seeds are "used" as user picks
- Validation: exactly 8 teams, no duplicate seeds — enforce in UI AND in DB trigger
- On submit: show confirmation with "Pay $25 via Venmo" deep link or QR
- If past deadline, show closed message (check `settings.entry_deadline`)
- Allow submission without auth (low friction)

### 3. Leaderboard (`/leaderboard`)
- Real-time (use Supabase realtime subscriptions on `game_results`)
- Rank, name, total points, entry count
- Expandable rows showing: picked teams, per-team scoring breakdown, upset indicators
- Prize money overlay showing 1st-4th payouts based on current pot
- Color-coding for payment status (admin view)
- Mobile responsive table/card layout

### 4. Admin Panel (`/admin`) — Protected by auth
- **Login:** Email/password via Supabase Auth
- **Manage Teams:** 
  - Bulk import from CSV (format: `seed,name,region`)
  - "Load 2025 Bracket" button — use a free NCAA API or pre-populated data
  - Edit/delete individual teams
  - Mark teams as eliminated
- **Enter Game Results:**
  - Select winning team, select losing team, select round
  - Show which games have already been entered (prevent duplicates)
  - Quick-entry mode: show expected matchups per round
  - Delete/edit results if mistakes
- **Manage Entries:**
  - View all entries with picks
  - Toggle paid/unpaid status
  - Delete fraudulent entries
  - Entry count + payment summary stats
- **Settings:**
  - Entry deadline date/time
  - Admin email list

---

## API / Server Actions

Use Next.js Server Actions or API routes:

### Public
- `GET /api/teams` — all teams
- `GET /api/leaderboard` — computed scores (use the SQL view)
- `POST /api/entries` — submit an entry (name + array of 8 team IDs)
  - Validate: exactly 8 picks, no duplicate seeds, before deadline

### Admin (authenticated)
- `POST /api/admin/teams/bulk` — bulk import teams
- `POST /api/admin/results` — enter game result
- `DELETE /api/admin/results/:id` — delete result
- `PATCH /api/admin/entries/:id` — update paid status
- `DELETE /api/admin/entries/:id` — delete entry
- `PUT /api/admin/settings` — update settings

---

## Design Direction

**Aesthetic:** Dark, bold sports-media feel. Think ESPN tournament tracker meets premium betting dashboard. Not corporate — this is for a fun pool among friends.

**Key design decisions:**
- Dark background (#0a0e17 range), amber/orange accent (#f59e0b)
- Bold condensed typeface for headers (Bebas Neue or Oswald from Google Fonts)
- Clean sans-serif for body (DM Sans or Outfit)
- Cards with subtle borders, not heavy shadows
- Seed badges color-coded by tier (1-2 gold, 3-4 green, 5-8 blue, 9-12 purple, 13-16 red)
- Mobile-first — most users will check the leaderboard on their phone
- Smooth animations on score updates (Framer Motion)
- Confetti or highlight animation for upset wins on leaderboard

---

## 2025 NCAA Tournament Teams

**These are the confirmed 2025 bracket teams** (already in `schema.sql` as seed data — no manual entry needed):

### South Region (Auburn #1 overall)
1-Auburn, 2-Michigan State, 3-Iowa State, 4-Texas A&M, 5-Michigan, 6-North Carolina, 7-Marquette, 8-Louisville, 9-Creighton, 10-New Mexico, 11-Ole Miss, 12-UC San Diego, 13-Yale, 14-Lipscomb, 15-Bryant, 16-Alabama State

### East Region
1-Duke, 2-Alabama, 3-Wisconsin, 4-Arizona, 5-Oregon, 6-BYU, 7-Saint Mary's, 8-Baylor, 9-Mississippi State, 10-Vanderbilt, 11-VCU, 12-Liberty, 13-Akron, 14-Montana, 15-Robert Morris, 16-Mount St. Mary's

### Midwest Region
1-Houston, 2-Tennessee, 3-Kentucky, 4-Purdue, 5-Clemson, 6-Xavier, 7-UCLA, 8-Georgia, 9-Gonzaga, 10-Utah State, 11-Illinois, 12-McNeese, 13-High Point, 14-Troy, 15-Wofford, 16-SIU Edwardsville

### West Region
1-Florida, 2-St. John's, 3-Texas Tech, 4-Maryland, 5-Memphis, 6-Missouri, 7-Kansas, 8-UConn, 9-Oklahoma, 10-Arkansas, 11-Drake, 12-Colorado State, 13-Grand Canyon, 14-UNC Wilmington, 15-Omaha, 16-Norfolk State

> **Champion:** Florida defeated Houston 65-63. All four #1 seeds made the Final Four (Auburn, Duke, Houston, Florida).

---

## Supabase Setup Steps (for Michael)

1. Create a new Supabase project at supabase.com
2. Open SQL Editor and paste the entire contents of `schema.sql` — this creates all tables, views, triggers, RLS policies, and seeds the 64 tournament teams
3. **Update the admin emails** in the SQL before running (search for `michael@example.com` and `taylor@example.com`)
4. Create auth accounts for those same emails in Auth > Users
5. Enable Realtime in Database > Replication for `game_results`, `entries`, and `entry_picks`
6. Copy your project URL + anon key for the Next.js env vars

### Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## Vercel Deploy Steps (for Michael)

1. Push repo to GitHub
2. Import to Vercel, connect to the repo
3. Add environment variables above
4. Deploy — Vercel auto-detects Next.js
5. Custom domain optional (e.g., marchmadness.claris-ai.com)

---

## Key Implementation Notes

### Seed Validation (MUST be correct)
```typescript
function validatePicks(picks: { teamId: string; seed: number }[]): { valid: boolean; error?: string } {
  if (picks.length !== 8) {
    return { valid: false, error: `Must pick exactly 8 teams (you have ${picks.length})` };
  }
  
  const seedCounts = new Map<number, number>();
  for (const pick of picks) {
    const count = (seedCounts.get(pick.seed) || 0) + 1;
    if (count > 1) {
      return { valid: false, error: `Cannot pick more than one #${pick.seed} seed` };
    }
    seedCounts.set(pick.seed, count);
  }
  
  return { valid: true };
}
```

### Score Calculation (MUST match rules exactly)
```typescript
const ROUND_POINTS: Record<number, number> = {
  1: 1,   // Round of 64
  2: 2,   // Round of 32
  3: 4,   // Sweet 16
  4: 6,   // Elite 8
  5: 10,  // Final Four → Championship
  6: 20,  // Championship win
};

function calculatePoints(
  winningTeamSeed: number, 
  losingTeamSeed: number, 
  round: number
): { points: number; isUpset: boolean } {
  const basePoints = ROUND_POINTS[round];
  const isUpset = winningTeamSeed > losingTeamSeed; // higher seed number = lower seed = upset if they win
  return {
    points: isUpset ? basePoints * 2 : basePoints,
    isUpset
  };
}
```

### Real-time Leaderboard
Subscribe to `game_results` table changes via Supabase Realtime. When a new result is inserted, re-query the leaderboard view. Consider debouncing if admin is entering multiple results quickly.

### Entry Deadline Enforcement
Check deadline both client-side (hide form, show countdown) and server-side (reject POST after deadline). Store deadline in `settings` table so admin can adjust.

---

## Testing Checklist

- [ ] Can submit entry with exactly 8 teams from different seeds
- [ ] Cannot submit with duplicate seeds (UI prevents + DB rejects)
- [ ] Cannot submit after deadline
- [ ] Leaderboard calculates correct base points per round
- [ ] Upset multiplier works (2× when higher seed number wins)
- [ ] Leaderboard updates in real-time when admin enters results
- [ ] Prize pool displays correctly based on entry count
- [ ] Admin can bulk import teams
- [ ] Admin can enter/delete game results
- [ ] Admin can toggle payment status
- [ ] Mobile layout works for all pages
- [ ] Multiple entries for same person display separately on leaderboard
