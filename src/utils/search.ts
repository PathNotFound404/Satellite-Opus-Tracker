/**
 * Satellite search by name or NORAD catalog number. Pure and allocation-light:
 * the index is built once; a query is one pass over pre-uppercased names.
 */

export interface SearchEntry {
  index: number
  name: string
  noradId: number
}

export interface SearchIndex {
  entries: SearchEntry[]
  upperNames: string[]
  idStrings: string[]
}

export function buildSearchIndex(records: readonly { OBJECT_NAME: string; NORAD_CAT_ID: number }[]): SearchIndex {
  const entries = records.map((r, index) => ({ index, name: r.OBJECT_NAME, noradId: r.NORAD_CAT_ID }))
  return {
    entries,
    upperNames: records.map((r) => r.OBJECT_NAME.toUpperCase()),
    idStrings: records.map((r) => String(r.NORAD_CAT_ID)),
  }
}

/** Lower is better. -1 = no match. */
function nameRank(name: string, q: string): number {
  if (name === q) return 0
  if (name.startsWith(q)) return 1
  const at = name.indexOf(q)
  if (at < 0) return -1
  // Match at the start of a word ("ISS" in "NOAA ISS-1", "ZARYA" in "ISS (ZARYA)").
  const before = name.charCodeAt(at - 1)
  const isWordStart = !((before >= 65 && before <= 90) || (before >= 48 && before <= 57))
  return isWordStart ? 2 : 3
}

/**
 * Up to `limit` matches, best first. Digits-only queries match NORAD IDs
 * (exact first, then prefix) as well as names. `include(i)` can exclude
 * satellites (e.g. ones that failed to propagate).
 */
export function searchSatellites(
  index: SearchIndex,
  query: string,
  limit = 8,
  include: (i: number) => boolean = () => true,
): SearchEntry[] {
  const q = query.trim().toUpperCase()
  if (!q) return []
  const numeric = /^\d+$/.test(q)

  const hits: { entry: SearchEntry; rank: number }[] = []
  for (let i = 0; i < index.entries.length; i++) {
    let rank = -1
    if (numeric) {
      const id = index.idStrings[i]!
      if (id === q) rank = 0
      else if (id.startsWith(q)) rank = 1
    }
    const nr = nameRank(index.upperNames[i]!, q)
    if (nr >= 0 && (rank < 0 || nr + 1 < rank)) rank = numeric ? nr + 1 : nr
    if (rank < 0 || !include(i)) continue
    hits.push({ entry: index.entries[i]!, rank })
  }

  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.entry.name.length - b.entry.name.length ||
      a.entry.noradId - b.entry.noradId,
  )
  return hits.slice(0, limit).map((h) => h.entry)
}
