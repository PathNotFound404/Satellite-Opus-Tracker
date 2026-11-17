import { describe, expect, it } from 'vitest'
import type { OmmRecord } from '../../src/types/data-contract'
import {
  assertFileShape,
  buildSatelliteFile,
  ISS_NORAD_ID,
  MIN_ACTIVE_RECORDS,
  pickRecord,
  ValidationError,
} from './build-file'

function record(id: number, name = `SAT ${id}`): OmmRecord & { EXTRA: string } {
  return {
    OBJECT_NAME: name,
    OBJECT_ID: '2000-001A',
    NORAD_CAT_ID: id,
    EPOCH: '2026-11-16T12:00:00.000000',
    MEAN_MOTION: 15.5,
    ECCENTRICITY: 0.0005,
    INCLINATION: 51.6,
    RA_OF_ASC_NODE: 10,
    ARG_OF_PERICENTER: 20,
    MEAN_ANOMALY: 30,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: 'U',
    ELEMENT_SET_NO: 999,
    REV_AT_EPOCH: 1,
    BSTAR: 0.0001,
    MEAN_MOTION_DOT: 0.00001,
    MEAN_MOTION_DDOT: 0,
    EXTRA: 'dropped',
  }
}

/** A valid `active` set: the ISS, two Starlinks, then filler up to the minimum. */
function activeSet(size = MIN_ACTIVE_RECORDS): unknown[] {
  const list: unknown[] = [
    record(ISS_NORAD_ID, 'ISS (ZARYA)'),
    record(44713, 'STARLINK-1007'),
    record(44714, 'STARLINK-1008'),
    record(24876, 'GPS BIIR-2'),
    record(33591, 'NOAA 19'),
  ]
  for (let id = 100000; list.length < size; id++) list.push(record(id))
  return list
}

function responses(active: unknown[] = activeSet()) {
  return {
    active,
    stations: [record(ISS_NORAD_ID), record(99999999)],
    'gps-ops': [record(24876)],
    weather: [record(33591)],
  }
}

const generatedAt = new Date('2026-11-16T18:23:05.123Z')

describe('pickRecord', () => {
  it('keeps only contract fields', () => {
    const picked = pickRecord(record(1))
    expect(picked).not.toBeNull()
    expect(picked).not.toHaveProperty('EXTRA')
    expect(Object.keys(picked!)).toHaveLength(17)
  })

  it('rejects missing or mistyped fields', () => {
    const missing: Record<string, unknown> = { ...record(1) }
    delete missing.BSTAR
    expect(pickRecord(missing)).toBeNull()
    expect(pickRecord({ ...record(1), NORAD_CAT_ID: '25544' })).toBeNull()
    expect(pickRecord({ ...record(1), MEAN_MOTION: Number.NaN })).toBeNull()
    expect(pickRecord(null)).toBeNull()
  })
})

describe('buildSatelliteFile', () => {
  it('builds a file that matches the contract', () => {
    const { file } = buildSatelliteFile({ responses: responses(), generatedAt })
    expect(file.schemaVersion).toBe(1)
    expect(file.generatedAt).toBe('2026-11-16T18:23:05Z')
    expect(file.count).toBe(file.satellites.length)
    expect(file.count).toBe(MIN_ACTIVE_RECORDS)
    expect(file.groups.starlink).toEqual([44713, 44714])
    expect(file.groups['gps-ops']).toEqual([24876])
    expect(file.groups.weather).toEqual([33591])
    expect(() => assertFileShape(file)).not.toThrow()
  })

  it('keeps tag-group IDs only if they are also in active', () => {
    const { file } = buildSatelliteFile({ responses: responses(), generatedAt })
    expect(file.groups.stations).toEqual([ISS_NORAD_ID])
  })

  it('fails when a response is not an array', () => {
    expect(() =>
      buildSatelliteFile({ responses: { ...responses(), weather: { error: 1 } }, generatedAt }),
    ).toThrow(ValidationError)
  })

  it('fails when active is too small', () => {
    expect(() =>
      buildSatelliteFile({ responses: responses(activeSet(MIN_ACTIVE_RECORDS - 1)), generatedAt }),
    ).toThrow(/at least/)
  })

  it('fails when active is under 80% of the live count', () => {
    expect(() =>
      buildSatelliteFile({ responses: responses(), liveCount: 10_000, generatedAt }),
    ).toThrow(/80%/)
    expect(() =>
      buildSatelliteFile({ responses: responses(), liveCount: 6000, generatedAt }),
    ).not.toThrow()
  })

  it('drops a few bad records but fails above 1%', () => {
    const fewBad = activeSet()
    fewBad.push({ NORAD_CAT_ID: 1 }, { NORAD_CAT_ID: 2 })
    const ok = buildSatelliteFile({ responses: responses(fewBad), generatedAt })
    expect(ok.droppedInvalid).toBe(2)
    expect(ok.file.count).toBe(MIN_ACTIVE_RECORDS)

    const manyBad = activeSet()
    for (let i = 0; i < 60; i++) manyBad.push({ junk: i })
    expect(() => buildSatelliteFile({ responses: responses(manyBad), generatedAt })).toThrow(
      /missing fields/,
    )
  })

  it('drops duplicate NORAD IDs and keeps the first', () => {
    const dup = activeSet()
    dup.push(record(ISS_NORAD_ID, 'DUPLICATE'))
    const { file, droppedDuplicate } = buildSatelliteFile({ responses: responses(dup), generatedAt })
    expect(droppedDuplicate).toBe(1)
    expect(file.satellites.find((s) => s.NORAD_CAT_ID === ISS_NORAD_ID)?.OBJECT_NAME).toBe(
      'ISS (ZARYA)',
    )
  })

  it('fails without the ISS in stations', () => {
    expect(() =>
      buildSatelliteFile({ responses: { ...responses(), stations: [record(1)] }, generatedAt }),
    ).toThrow(/ISS/)
  })

  it('fails when a tag group is empty', () => {
    expect(() =>
      buildSatelliteFile({ responses: { ...responses(), weather: [] }, generatedAt }),
    ).toThrow(/"weather" is empty/)
  })
})

describe('assertFileShape', () => {
  it('rejects unknown schema versions and count mismatches', () => {
    const { file } = buildSatelliteFile({ responses: responses(), generatedAt })
    expect(() => assertFileShape({ ...file, schemaVersion: 2 })).toThrow(/schemaVersion/)
    expect(() => assertFileShape({ ...file, count: 1 })).toThrow(/count/)
    expect(() => assertFileShape({ ...file, generatedAt: 'yesterday' })).toThrow(/generatedAt/)
  })
})
