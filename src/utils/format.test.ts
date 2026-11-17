import { describe, expect, it } from 'vitest'
import { formatAge, formatInteger, formatNumber } from './format'

const MIN = 60_000
const HOUR = 60 * MIN

describe('formatAge', () => {
  it.each([
    [0, 'just now'],
    [59_999, 'just now'],
    [MIN, '1 minute ago'],
    [45 * MIN, '45 minutes ago'],
    [HOUR, '1 hour ago'],
    [5.9 * HOUR, '5 hours ago'],
    [47 * HOUR, '47 hours ago'],
    [48 * HOUR, '2 days ago'],
    [10 * 24 * HOUR, '10 days ago'],
  ])('%d ms -> %s', (ms, text) => {
    expect(formatAge(ms)).toBe(text)
  })
})

describe('formatInteger / formatNumber', () => {
  it('groups thousands and fixes decimals', () => {
    expect(formatInteger(16892)).toBe('16,892')
    expect(formatNumber(408.149, 1, 'km')).toBe('408.1 km')
    expect(formatNumber(7.6612, 2, 'km/s')).toBe('7.66 km/s')
    expect(formatNumber(1234.5, 0)).toBe('1,235')
  })
})
