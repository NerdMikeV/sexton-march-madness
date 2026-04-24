# Sexton March Madness

## Instructions for AI Agents
<!-- DO NOT DELETE THIS SECTION — it tells AI agents how to maintain this document -->
When you finish a coding session, update this document before your final commit:
- Move any tasks you completed from "In-Progress Work" to "Recent Changes" with today's date, your branch name, and a brief summary of what you did
- If you discovered a bug or issue during your session, add it to "Active Issues" with the appropriate severity
- If you made an architectural decision (chose a library, established a pattern, changed a convention), add it to "Recent Decisions"
- If you encountered something that would trip up the next person working on this project, add it to "Known Gotchas"
- Always include the branch name in your Recent Changes entries, e.g. "Apr 20 (staging): Fixed SFTP retry logic"
- Do NOT modify Quick Reference or Architecture sections unless you made structural changes to the project
- Do NOT remove entries from Recent Changes — it is append-only (newest at top)
- Keep this document under 500 lines. If Recent Changes grows beyond 30 entries, remove the oldest ones.

## Quick Reference
<!-- Maintained by: Claris OS (auto-generated) and humans (manual edits) -->
- **What**: NCAA March Madness bracket contest app — participants pick 8 teams (one per seed line), earn points when teams win (double for upsets), compete on a live leaderboard for prize money
- **Stack**: Next.js 15 (App Router) + Supabase (PostgreSQL, Auth, Realtime) + Tailwind CSS + Odds API (live scores & auto-grading)
- **Repo**: NerdMikeV/sexton-march-madness
- **Deploy**: Vercel (frontend + serverless API routes) + Supabase (hosted DB)
- **URLs**: 
  - Production: https://sexton-march-madness.vercel.app
  - Supabase project: Sexton-March-Madness (NerdMikeV's Org)
  - GitHub: https://github.com/NerdMikeV/sexton-march-madness
- **Key People**: Michael Vestal (admin, developer), Taylor Sexton (admin, contest organizer)
- **Last context sync**: 2026-04-24 08:16 UTC

## Current State
<!-- Maintained by: Claris OS auto-updater ONLY — do not edit manually -->
<!-- This section is regenerated from the Claris OS database whenever tasks, issues, or builds change -->

### Active Issues
- No open issues

### In-Progress Work
- Nothing currently in progress

### Pending To-Dos
- No pending tasks

### Pending Tests
- No tasks awaiting testing

## Recent Changes
<!-- Maintained by: Claude Code sessions (append new entries at top) -->
<!-- Format: "- {date} ({branch}): {who} — {what was done}" -->
<!-- Newest entries at top. Keep max 30 entries. -->

- 2026-03-19 (main): Claude Code — Fixed Iowa/Iowa State prefix matching bug. Added word-boundary guard (TEAM_QUALIFIER_WORDS) and longest-match-wins in findTeam
- 2026-03-19 (main): Claude Code — Fixed leaderboard to show all entries pre-scoring (reads from entries table, not leaderboard view). Fixed picks pagination (batch query with 1000-row pages)
- 2026-03-19 (main): Claude Code — Fixed First Four UTC date bug (SMU/Miami OH game at 9pm ET = March 19 UTC). Fixed Miami (OH) false match by fusing "miami oh" → "miamioh"
- 2026-03-18 (main): Claude Code — Built auto-grading system in /api/scores route. Completed games auto-insert into game_results, losers marked eliminated
- 2026-03-18 (main): Claude Code — Fixed Live Scores team name matching: bidirectional prefix check, play-in slash splitting, mascot name stripping, alias expansions (UNI→Northern Iowa, Penn→Pennsylvania, etc.)
- 2026-03-17 (main): Claude Code — Added tiebreaker field (total championship game points), leaderboard picks reveal gate with countdown, entry name disambiguation for duplicate names
- 2026-03-16 (main): Claude Code — Loaded 2026 NCAA tournament bracket (64 teams, 4 regions). Swapped Alabama/Arkansas regions. Fixed entry deadline to read from DB settings table
- 2026-03-16 (main): Claude Code — Added Live Scores page with Odds API integration, tournament-only game filtering, upcoming games via /events endpoint
- 2026-03-15 (main): Claude Code — Added bracket visualization page with SVG connectors, region tabs, Final Four section. Overhauled typography (Bebas Neue + Inter, removed medieval font)
- 2026-03-15 (main): Claude Code — Built entry form with seed validation, leaderboard with real-time Supabase subscriptions, admin panel (Teams/Results/Entries/Settings tabs), My Entries page
- 2026-03-15 (main): Claude Code — Initial build. Next.js 14 app with Supabase schema, 2025 test bracket, entry submission, admin panel

## Recent Decisions
<!-- Maintained by: Both Claris OS (from decisions table) and Claude Code (from session discoveries) -->

- **No separate backend needed**: Vercel serverless functions handle all API routes. No Railway deployment required.
- **No auth for entry submission**: Entries only require name + email (no login). Keeps friction low for 150+ participants. Admin panel uses Supabase Auth (email/password).
- **Auto-grading over manual**: The /api/scores route auto-inserts game results when completed games are detected from the Odds API. Manual entry available as fallback in admin panel.
- **Strict team name matching**: Exact prefix match after normalization/expansion. Word boundary guards prevent Iowa→Iowa State collisions. Longest match wins as safety net.
- **Play-in teams stored with slash**: First Four play-in teams stored as "UMBC/Howard", "SMU/Miami (OH)", etc. Cosmetic only — doesn't affect scoring.
- **Entries are immutable**: No edit endpoint. If someone messes up, admin deletes and they resubmit.
- **Email required on entries**: For contestant contact and payment tracking.

## Architecture & Patterns
<!-- Maintained by: Humans and Claude Code (only on structural changes) -->

### Project Structure
- **NerdMikeV/sexton-march-madness** — https://github.com/NerdMikeV/sexton-march-madness (default branch: `main`)
- `/app` — Next.js App Router pages and API routes
  - `/app/api/scores/route.ts` — Live scores + auto-grading engine (fetches Odds API, filters to tournament games, auto-inserts results)
  - `/app/api/entries/route.ts` — Entry submission with seed validation and deadline check
  - `/app/api/leaderboard/route.ts` — Reads from leaderboard SQL view
  - `/app/api/admin/*` — Admin routes (results, entries, teams, settings, reset, simulate)
  - `/app/admin/page.tsx` — Admin panel with Teams/Results/Entries/Settings tabs
  - `/app/leaderboard/page.tsx` — Public leaderboard with picks reveal gate
  - `/app/bracket/page.tsx` — Tournament bracket visualization with SVG connectors
  - `/app/scores/page.tsx` — Live Scores page (Odds API powered)
  - `/app/enter/page.tsx` — Entry form with team picker and seed validation
  - `/app/my-entries/page.tsx` — Email lookup for participant's own entries
- `/lib` — Shared utilities (Supabase clients, name matching utils)
- `/migrations` — SQL migration files for Supabase schema changes

### Database Schema (Supabase PostgreSQL)
- **teams** — 64 tournament teams (name, seed, region, is_eliminated)
- **entries** — Contest entries (participant_name, participant_email, paid, tiebreaker_total)
- **entry_picks** — 8 picks per entry (entry_id → team_id)
- **game_results** — Completed game results (winning_team_id, losing_team_id, round)
- **settings** — Key-value config (entry_deadline, picks_reveal_at, contest_year, venmo_handle, etc.)
- **admins** — Admin email list for RLS
- **leaderboard** — SQL VIEW that auto-calculates scores with upset multiplier

### Scoring Logic (in leaderboard SQL view)
- Round 1 (R64): 1 pt | Round 2 (R32): 2 pts | Round 3 (Sweet 16): 4 pts
- Round 4 (Elite 8): 6 pts | Round 5 (Final Four): 10 pts | Round 6 (Championship): 20 pts
- **Upset = winning team has HIGHER seed number** → points DOUBLED
- Prize split: 1st 60%, 2nd 25%, 3rd 10%, 4th 5%
- Entry fee: $25 (Venmo: @TaylorSextonTX)

### Auto-Grading System (app/api/scores/route.ts)
- Fetches completed games from Odds API every 60 seconds (cache revalidation)
- Team name matching: normalize → expand aliases → prefix match with word boundary guards → longest match wins
- Round detection by game date (ET timezone): Mar 17-18 = First Four, Mar 19-20 = R1, Mar 21-22 = R2, Mar 26-27 = Sweet 16, Mar 28-29 = Elite 8, Apr 4 = Final Four, Apr 6 = Championship
- First Four games update play-in team names only (no game_result insert)
- Writes use SUPABASE_SERVICE_ROLE_KEY (bypasses RLS)

### Coding Conventions
- TypeScript throughout
- Tailwind CSS for styling (dark theme, amber/orange accents)
- Bebas Neue for headers, Inter for body text
- Server-side API routes for all Supabase writes and Odds API calls (keys never exposed to client)
- Supabase Realtime subscriptions for live leaderboard and bracket updates

### Known Gotchas
<!-- Maintained by: Claude Code (adds gotchas discovered during sessions) -->
- **Vercel edge caching**: After deploying fixes, the old serverless function may be cached. Append `?t=bust` to API URLs or redeploy with cache clear to force update.
- **Supabase 1000-row default limit**: Queries with >1000 results silently truncate. Must paginate (entry_picks has 1256+ rows).
- **UTC vs ET for round detection**: Odds API commence_time is UTC. A 9pm ET game on March 18 = March 19 UTC. Must convert to ET before determining round.
- **Team name collisions**: Iowa/Iowa State, Miami (FL)/Miami (OH), Georgia/Georgia Tech. Word boundary guards in expand() and longest-match-wins in findTeam() prevent false matches.
- **Play-in slash names**: "SMU/Miami (OH)" stored as one team. Matching splits on "/" and checks each half. Cosmetic only — doesn't affect scoring.
- **Mascot names in Odds API**: API returns "Duke Blue Devils" not "Duke". Prefix matching strips mascots. Full alias list in expand() function.
- **Next.js build cache**: "Cannot find module ./948.js" errors → run `rm -rf .next && npm run dev`
- **Always use production URL**: `sexton-march-madness.vercel.app` — NOT deployment-specific URLs. Each deploy gets a unique URL but only the production URL stays current.
- **npm run dev port**: Ports 3000, 3003, 5174 may be in use locally. Use `npm run dev -- -p 3001`
- **.env vs .env.local**: Real env vars are in `.env`. The `.env.local` was deleted (was a blank template).
- **Service role key for auto-grading**: SUPABASE_SERVICE_ROLE_KEY must be in Vercel env vars for auto-grading writes to work. Anon key is read-only due to RLS.

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL (https://xxxx.supabase.co)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public API key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (for auto-grading writes, bypasses RLS)
- `ODDS_API_KEY` — The Odds API key (basketball_ncaab sport key, ~100K credits/month)
- `BYPASS_DEADLINE` — Set to "true" to bypass entry deadline (testing only, removed for production)

## History
<!-- Maintained by: Claris OS (major milestones from builds/deploys) -->
<!-- Append-only, newest at top -->

- 2026-03-19: Tournament begins. 157 entries, $3,975 prize pool. Auto-grading live for Round of 64.
- 2026-03-18: First Four games. Auto-grading deployed. Fixed Miami matching bug and UTC date detection.
- 2026-03-17: 2026 bracket loaded. Entries open. Live Scores page working with tournament game filtering.
- 2026-03-16: App deployed to Vercel. Entry collection begins. 100+ entries within first day.
- 2026-03-15: Initial build complete. Next.js + Supabase + Tailwind. Schema deployed with 2025 test data.
- 2026-03-12: Project started. Spec and schema designed in Claude.ai conversation.
