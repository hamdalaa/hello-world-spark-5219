import { describe, expect, it, vi } from 'vitest'

import {
  buildStreamUrl,
  isEmptyXtreamPayload,
  mapContentTypeToActions,
  normalizeServerUrl,
  requestXtreamJson,
} from './xtream'

describe('Xtream service helpers', () => {
  it('normalizes provider URLs for HTTP Xtream panels', () => {
    expect(normalizeServerUrl('example.com:8080/')).toBe('http://example.com:8080')
    expect(normalizeServerUrl(' https://host.test/live/ ')).toBe('https://host.test/live')
  })

  it('rejects blank provider URLs', () => {
    expect(() => normalizeServerUrl('   ')).toThrow(/required/i)
  })

  it('rejects non-http provider URLs', () => {
    expect(() => normalizeServerUrl('file:///etc/passwd')).toThrow(/http/i)
  })

  it('maps content types to Xtream API actions', () => {
    expect(mapContentTypeToActions('live')).toEqual({
      categories: 'get_live_categories',
      streams: 'get_live_streams',
    })
    expect(mapContentTypeToActions('movie')).toEqual({
      categories: 'get_vod_categories',
      streams: 'get_vod_streams',
    })
    expect(mapContentTypeToActions('series')).toEqual({
      categories: 'get_series_categories',
      streams: 'get_series',
    })
  })

  it('detects empty Xtream responses for retry', () => {
    expect(isEmptyXtreamPayload([])).toBe(true)
    expect(isEmptyXtreamPayload({})).toBe(true)
    expect(isEmptyXtreamPayload([{ name: 'BBC' }])).toBe(false)
    expect(isEmptyXtreamPayload({ user_info: { auth: 1 } })).toBe(false)
  })

  it('builds provider stream URLs without leaking credentials into client state', () => {
    const credentials = {
      serverUrl: 'http://panel.test:8080',
      username: 'user',
      password: 'pass',
    }

    expect(buildStreamUrl(credentials, 'live', '44', 'm3u8')).toBe(
      'http://panel.test:8080/live/user/pass/44.m3u8',
    )
    expect(buildStreamUrl(credentials, 'movie', '8', 'mp4')).toBe(
      'http://panel.test:8080/movie/user/pass/8.mp4',
    )
    expect(buildStreamUrl(credentials, 'series', '9', 'mkv')).toBe(
      'http://panel.test:8080/series/user/pass/9.mkv',
    )
  })

  it('retries once when a provider returns a blank 200 payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ stream_id: 7 }]), { status: 200 }))

    await expect(
      requestXtreamJson(
        { serverUrl: 'http://panel.test', username: 'u', password: 'p' },
        { action: 'get_live_streams' },
        { fetchImpl: fetchMock },
      ),
    ).resolves.toEqual([{ stream_id: 7 }])

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('can return an empty payload without retry when requested', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

    await expect(
      requestXtreamJson(
        { serverUrl: 'http://panel.test', username: 'u', password: 'p' },
        { action: 'get_live_streams' },
        { fetchImpl: fetchMock, retryEmpty: false },
      ),
    ).resolves.toEqual([])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws on provider HTTP errors', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('nope', { status: 503 }))

    await expect(
      requestXtreamJson(
        { serverUrl: 'http://panel.test', username: 'u', password: 'p' },
        { action: 'get_live_streams' },
        { fetchImpl: fetchMock },
      ),
    ).rejects.toThrow(/503/)
  })
})
