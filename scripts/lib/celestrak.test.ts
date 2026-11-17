import { describe, expect, it, vi } from 'vitest'
import { CelestrakError, fetchAllGroups, groupUrl } from './celestrak'

function respond(status: number, body: string): Response {
  return new Response(body, { status })
}

describe('groupUrl', () => {
  it('uses the .org GP endpoint with JSON format', () => {
    expect(groupUrl('gps-ops')).toBe(
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=JSON',
    )
  })
})

describe('fetchAllGroups', () => {
  it('requests the four groups one at a time, never starlink', async () => {
    const urls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url)
      return respond(200, '[]')
    })
    const outcome = await fetchAllGroups(fetchImpl)
    expect(outcome.kind).toBe('ok')
    expect(urls.map((u) => new URL(u).searchParams.get('GROUP'))).toEqual([
      'active',
      'stations',
      'gps-ops',
      'weather',
    ])
    expect(urls.some((u) => u.includes('starlink'))).toBe(false)
  })

  it('stops at the first non-200 with no retries and no further requests', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respond(200, '[]'))
      .mockResolvedValueOnce(respond(404, 'Not found'))
      .mockResolvedValue(respond(200, '[]'))
    await expect(fetchAllGroups(fetchImpl)).rejects.toBeInstanceOf(CelestrakError)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('stops on a 500 too', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(503, 'busy'))
    await expect(fetchAllGroups(fetchImpl)).rejects.toThrow(/HTTP 503/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('treats the "not updated" 403 as a skip, not a failure', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        respond(403, 'GP data has not updated since your last successful download of GROUP=active'),
      )
    const outcome = await fetchAllGroups(fetchImpl)
    expect(outcome).toMatchObject({ kind: 'not-updated', group: 'active' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('fails on any other 403', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(403, 'Forbidden'))
    await expect(fetchAllGroups(fetchImpl)).rejects.toThrow(/HTTP 403/)
  })

  it('fails on invalid JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(200, '<html>'))
    await expect(fetchAllGroups(fetchImpl)).rejects.toThrow(/valid JSON/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('fails on a network error without retrying', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    await expect(fetchAllGroups(fetchImpl)).rejects.toThrow(/Network error/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
