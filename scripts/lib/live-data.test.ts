import { describe, expect, it } from 'vitest'
import { resolveProductionUrl } from './live-data'

describe('resolveProductionUrl', () => {
  it('prefers PRODUCTION_URL and trims trailing slashes', () => {
    expect(
      resolveProductionUrl({ PRODUCTION_URL: 'https://example.app/', VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' }),
    ).toBe('https://example.app')
  })

  it('falls back to the Vercel production host', () => {
    expect(resolveProductionUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'sat.vercel.app' })).toBe(
      'https://sat.vercel.app',
    )
  })

  it('returns undefined when nothing is set', () => {
    expect(resolveProductionUrl({ PRODUCTION_URL: '  ' })).toBeUndefined()
  })
})
