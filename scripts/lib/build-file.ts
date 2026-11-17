/**
 * Pure logic for turning CelesTrak responses into a validated SatelliteFile.
 * No network or file system here, so every validation rule in
 * docs/data-contract.md can be unit tested.
 */
import {
  OMM_FIELDS,
  SCHEMA_VERSION,
  type FetchedGroup,
  type OmmRecord,
  type SatelliteFile,
  type TagGroup,
} from '../../src/types/data-contract'

export const MIN_ACTIVE_RECORDS = 5000
/** A fresh `active` set smaller than this share of the live one looks partial. */
export const MIN_SHARE_OF_LIVE = 0.8
export const MAX_DROPPED_SHARE = 0.01
export const ISS_NORAD_ID = 25544

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export interface BuildInput {
  /** Parsed JSON body per fetched group. Must be arrays. */
  responses: Record<FetchedGroup, unknown>
  /** Record count of the currently live file, if one exists. */
  liveCount?: number
  generatedAt: Date
}

export interface BuildResult {
  file: SatelliteFile
  droppedInvalid: number
  droppedDuplicate: number
}

/** Keep only contract fields; return null if any is missing or the wrong type. */
export function pickRecord(raw: unknown): OmmRecord | null {
  if (typeof raw !== 'object' || raw === null) return null
  const source = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [field, type] of Object.entries(OMM_FIELDS)) {
    const value = source[field]
    if (typeof value !== type) return null
    if (type === 'number' && !Number.isFinite(value)) return null
    out[field] = value
  }
  return out as unknown as OmmRecord
}

function idsFrom(raw: unknown): Set<number> {
  const ids = new Set<number>()
  if (!Array.isArray(raw)) return ids
  for (const r of raw) {
    const id = (r as { NORAD_CAT_ID?: unknown } | null)?.NORAD_CAT_ID
    if (typeof id === 'number') ids.add(id)
  }
  return ids
}

export function buildSatelliteFile(input: BuildInput): BuildResult {
  const { responses, liveCount, generatedAt } = input

  for (const [group, body] of Object.entries(responses)) {
    if (!Array.isArray(body)) {
      throw new ValidationError(`Group "${group}" did not return a JSON array`)
    }
  }
  const activeRaw = responses.active as unknown[]

  if (activeRaw.length < MIN_ACTIVE_RECORDS) {
    throw new ValidationError(
      `"active" has ${activeRaw.length} records; expected at least ${MIN_ACTIVE_RECORDS}`,
    )
  }
  if (liveCount !== undefined && activeRaw.length < liveCount * MIN_SHARE_OF_LIVE) {
    throw new ValidationError(
      `"active" has ${activeRaw.length} records, under ${MIN_SHARE_OF_LIVE * 100}% of the live ${liveCount}`,
    )
  }

  const satellites: OmmRecord[] = []
  const seen = new Set<number>()
  let droppedInvalid = 0
  let droppedDuplicate = 0
  for (const raw of activeRaw) {
    const record = pickRecord(raw)
    if (!record) {
      droppedInvalid++
      continue
    }
    if (seen.has(record.NORAD_CAT_ID)) {
      droppedDuplicate++
      continue
    }
    seen.add(record.NORAD_CAT_ID)
    satellites.push(record)
  }

  if (droppedInvalid > activeRaw.length * MAX_DROPPED_SHARE) {
    throw new ValidationError(
      `${droppedInvalid} of ${activeRaw.length} records were missing fields (limit ${MAX_DROPPED_SHARE * 100}%)`,
    )
  }

  const inActive = (ids: Set<number>) => [...ids].filter((id) => seen.has(id)).sort((a, b) => a - b)
  const groups: Record<TagGroup, number[]> = {
    stations: inActive(idsFrom(responses.stations)),
    starlink: satellites
      .filter((s) => s.OBJECT_NAME.toUpperCase().startsWith('STARLINK'))
      .map((s) => s.NORAD_CAT_ID)
      .sort((a, b) => a - b),
    'gps-ops': inActive(idsFrom(responses['gps-ops'])),
    weather: inActive(idsFrom(responses.weather)),
  }

  if (!groups.stations.includes(ISS_NORAD_ID)) {
    throw new ValidationError('"stations" does not contain the ISS (25544)')
  }
  for (const [name, ids] of Object.entries(groups)) {
    if (ids.length === 0) throw new ValidationError(`Group "${name}" is empty`)
  }

  const file: SatelliteFile = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    source: 'CelesTrak GP',
    count: satellites.length,
    groups,
    satellites,
  }
  assertFileShape(file)
  return { file, droppedInvalid, droppedDuplicate }
}

/**
 * Structural check of a whole file, used on the freshly built file and on any
 * file downloaded from production before trusting it.
 */
export function assertFileShape(value: unknown): asserts value is SatelliteFile {
  if (typeof value !== 'object' || value === null) throw new ValidationError('Not an object')
  const f = value as Partial<SatelliteFile>
  if (f.schemaVersion !== SCHEMA_VERSION) {
    throw new ValidationError(`Unknown schemaVersion ${String(f.schemaVersion)}`)
  }
  if (typeof f.generatedAt !== 'string' || Number.isNaN(Date.parse(f.generatedAt))) {
    throw new ValidationError('Missing or invalid generatedAt')
  }
  if (!Array.isArray(f.satellites)) throw new ValidationError('satellites is not an array')
  if (f.count !== f.satellites.length) {
    throw new ValidationError(`count ${String(f.count)} != satellites.length ${f.satellites.length}`)
  }
  if (typeof f.groups !== 'object' || f.groups === null) throw new ValidationError('Missing groups')
}
