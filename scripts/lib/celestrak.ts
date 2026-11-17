/**
 * CelesTrak requests, following the fair-use rules in docs/ci-cd.md:
 * one request per group, one at a time, stop at the first non-200, never retry.
 */
import { FETCHED_GROUPS, type FetchedGroup } from '../../src/types/data-contract'

export const CELESTRAK_GP_URL = 'https://celestrak.org/NORAD/elements/gp.php'

export function groupUrl(group: FetchedGroup): string {
  return `${CELESTRAK_GP_URL}?GROUP=${encodeURIComponent(group)}&FORMAT=JSON`
}

/** The expected 403 when this IP already downloaded the group in the current update window. */
const NOT_UPDATED_PATTERN = /has not updated since your last/i

export type FetchOutcome =
  | { kind: 'ok'; responses: Record<FetchedGroup, unknown>; bytes: number }
  | { kind: 'not-updated'; group: FetchedGroup; message: string }

export class CelestrakError extends Error {
  constructor(
    message: string,
    readonly group: FetchedGroup,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'CelestrakError'
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export async function fetchAllGroups(
  fetchImpl: FetchLike = fetch,
  log: (line: string) => void = () => {},
): Promise<FetchOutcome> {
  const responses = {} as Record<FetchedGroup, unknown>
  let bytes = 0

  for (const group of FETCHED_GROUPS) {
    const url = groupUrl(group)
    log(`GET ${url}`)
    let res: Response
    try {
      res = await fetchImpl(url, { headers: { Accept: 'application/json' } })
    } catch (err) {
      throw new CelestrakError(`Network error for "${group}": ${String(err)}`, group)
    }

    const text = await res.text()
    if (res.status === 403 && NOT_UPDATED_PATTERN.test(text)) {
      return { kind: 'not-updated', group, message: text.trim().slice(0, 300) }
    }
    if (res.status !== 200) {
      throw new CelestrakError(
        `HTTP ${res.status} for "${group}": ${text.trim().slice(0, 300)}`,
        group,
        res.status,
      )
    }

    try {
      responses[group] = JSON.parse(text)
    } catch {
      throw new CelestrakError(`"${group}" did not return valid JSON`, group, res.status)
    }
    bytes += text.length
    log(`  200, ${Array.isArray(responses[group]) ? (responses[group] as unknown[]).length : '?'} records`)
  }

  return { kind: 'ok', responses, bytes }
}
