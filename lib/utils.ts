/**
 * Given entries sorted by submitted_at ascending, returns the same entries
 * with a display_name field added. Duplicate participant_names get a suffix:
 * first entry keeps the plain name, subsequent ones get " 2", " 3", etc.
 *
 * Always pass entries sorted oldest-first so the original submission keeps
 * the clean name.
 */
export function disambiguateNames<T extends { participant_name: string }>(
  entries: T[]
): (T & { display_name: string })[] {
  const counts = new Map<string, number>()
  for (const e of entries) {
    counts.set(e.participant_name, (counts.get(e.participant_name) ?? 0) + 1)
  }
  const seen = new Map<string, number>()
  return entries.map(e => {
    const name = e.participant_name
    if ((counts.get(name) ?? 0) <= 1) return { ...e, display_name: name }
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    return { ...e, display_name: n === 1 ? name : `${name} ${n}` }
  })
}

/**
 * Build a Map<id, display_name> from a collection of entries, using
 * submission order to decide which gets the clean name. Use this when
 * entries are displayed in a different order than submission order
 * (e.g. leaderboard sorted by points).
 */
export function buildDisplayNameMap<T extends { participant_name: string; submitted_at: string }>(
  entries: T[],
  getId: (e: T) => string
): Map<string, string> {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
  )
  const disambiguated = disambiguateNames(sorted)
  return new Map(disambiguated.map(e => [getId(e), e.display_name]))
}
