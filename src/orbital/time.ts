import { gstime } from 'satellite.js'
import { MINUTES_PER_DAY } from './constants'

const MS_PER_DAY = 86_400_000
/** Julian date of the Unix epoch, 1970-01-01T00:00:00Z. */
const JD_UNIX_EPOCH = 2440587.5

/** UTC milliseconds since the Unix epoch -> Julian date. No Date allocation. */
export function msToJulian(utcMs: number): number {
  return utcMs / MS_PER_DAY + JD_UNIX_EPOCH
}

/**
 * Greenwich mean sidereal time (radians) for a UTC time.
 * IAU-82 model via satellite.js. Strictly it takes UT1; using UTC instead is
 * off by |UT1-UTC| < 0.9 s, under 0.5 km at GEO and well inside SGP4's own error.
 */
export function gmstAt(utcMs: number): number {
  return gstime(msToJulian(utcMs))
}

/** Minutes from a satellite's epoch (Julian date) to a UTC time, as SGP4 expects. */
export function minutesSinceEpoch(epochJd: number, utcMs: number): number {
  return (msToJulian(utcMs) - epochJd) * MINUTES_PER_DAY
}

/** OMM EPOCH ("2026-11-16T12:01:23.456789", UTC, no Z) -> UTC ms. NaN if unparseable. */
export function parseOmmEpoch(epoch: string): number {
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(epoch) ? epoch : `${epoch}Z`)
}
