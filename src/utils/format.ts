/** Display formatting. Pure functions, no Vue. */

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Data older than this is probably a failing pipeline. */
export const STALE_DATA_MS = 24 * HOUR_MS

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function formatAge(ageMs: number): string {
  if (ageMs < MINUTE_MS) return 'just now'
  if (ageMs < HOUR_MS) return plural(Math.floor(ageMs / MINUTE_MS), 'minute')
  if (ageMs < 2 * DAY_MS) return plural(Math.floor(ageMs / HOUR_MS), 'hour')
  return plural(Math.floor(ageMs / DAY_MS), 'day')
}

const integerFormat = new Intl.NumberFormat('en-US')
export function formatInteger(n: number): string {
  return integerFormat.format(n)
}

/** Fixed decimals with a thin unit suffix: formatNumber(408.123, 1, 'km') -> "408.1 km". */
export function formatNumber(value: number, decimals: number, unit?: string): string {
  const text = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return unit ? `${text} ${unit}` : text
}
