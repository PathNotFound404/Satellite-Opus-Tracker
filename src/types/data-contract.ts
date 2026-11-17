/**
 * Types for the satellite data file. Must match docs/data-contract.md.
 * Any breaking change bumps SCHEMA_VERSION and updates that doc, sample.json
 * and scripts/ in the same PR.
 */

export const SCHEMA_VERSION = 1

/** CelesTrak groups we download. `starlink` is derived from names, never fetched. */
export const FETCHED_GROUPS = ['active', 'stations', 'gps-ops', 'weather'] as const
export type FetchedGroup = (typeof FETCHED_GROUPS)[number]

export const TAG_GROUPS = ['stations', 'starlink', 'gps-ops', 'weather'] as const
export type TagGroup = (typeof TAG_GROUPS)[number]

/**
 * One satellite, with CelesTrak's OMM field names unchanged so it can go
 * straight to satellite.js `json2satrec`.
 * Units are OMM's: MEAN_MOTION in rev/day, angles in degrees, EPOCH in UTC
 * without a `Z` suffix.
 */
export interface OmmRecord {
  OBJECT_NAME: string
  OBJECT_ID: string
  NORAD_CAT_ID: number
  EPOCH: string
  MEAN_MOTION: number
  ECCENTRICITY: number
  INCLINATION: number
  RA_OF_ASC_NODE: number
  ARG_OF_PERICENTER: number
  MEAN_ANOMALY: number
  EPHEMERIS_TYPE: number
  CLASSIFICATION_TYPE: string
  ELEMENT_SET_NO: number
  REV_AT_EPOCH: number
  BSTAR: number
  MEAN_MOTION_DOT: number
  MEAN_MOTION_DDOT: number
}

export interface SatelliteFile {
  schemaVersion: typeof SCHEMA_VERSION
  /** UTC ISO 8601, when the pipeline fetched the data. */
  generatedAt: string
  source: string
  /** Always equal to satellites.length. */
  count: number
  /** Group name -> NORAD catalog IDs. */
  groups: Record<TagGroup, number[]>
  satellites: OmmRecord[]
}

/** Field name -> expected `typeof`. The single list of kept fields. */
export const OMM_FIELDS = {
  OBJECT_NAME: 'string',
  OBJECT_ID: 'string',
  NORAD_CAT_ID: 'number',
  EPOCH: 'string',
  MEAN_MOTION: 'number',
  ECCENTRICITY: 'number',
  INCLINATION: 'number',
  RA_OF_ASC_NODE: 'number',
  ARG_OF_PERICENTER: 'number',
  MEAN_ANOMALY: 'number',
  EPHEMERIS_TYPE: 'number',
  CLASSIFICATION_TYPE: 'string',
  ELEMENT_SET_NO: 'number',
  REV_AT_EPOCH: 'number',
  BSTAR: 'number',
  MEAN_MOTION_DOT: 'number',
  MEAN_MOTION_DDOT: 'number',
} as const satisfies Record<keyof OmmRecord, 'string' | 'number'>
