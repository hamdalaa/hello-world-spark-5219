import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

import { createServer } from './app'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HTTP API', () => {
  const activePayload = {
    user_info: { auth: 1, username: 'demo', status: 'Active', exp_date: '1893456000' },
    server_info: { url: 'panel.test', port: '80' },
  }

  it('authenticates against player_api.php and stores credentials in an HTTP-only session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(activePayload),
      ),
    )

    const response = await request(createServer())
      .post('/api/auth/login')
      .send({ serverUrl: 'http://panel.test', username: 'demo', password: 'secret' })
      .expect(200)

    expect(response.body.userInfo).toMatchObject({ username: 'demo', status: 'Active' })
    expect(response.body).not.toHaveProperty('password')
    const setCookie = response.headers['set-cookie']
    expect(Array.isArray(setCookie) ? setCookie.join(';') : setCookie).toContain('HttpOnly')
  })

  it('rejects inactive or invalid accounts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          user_info: { auth: 0, status: 'Disabled' },
        }),
      ),
    )

    await request(createServer())
      .post('/api/auth/login')
      .send({ serverUrl: 'http://panel.test', username: 'demo', password: 'bad' })
      .expect(401)
  })

  it('rejects malformed login payloads', async () => {
    await request(createServer()).post('/api/auth/login').send({ serverUrl: '' }).expect(400)
  })

  it('requires a session before fetching Xtream streams', async () => {
    await request(createServer()).get('/api/xtream/streams?type=live').expect(401)
  })

  it('restores and clears the HTTP-only session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(activePayload)))

    const agent = request.agent(createServer())
    await agent
      .post('/api/auth/login')
      .send({ serverUrl: 'http://panel.test', username: 'demo', password: 'secret' })
      .expect(200)

    const me = await agent.get('/api/auth/me').expect(200)
    expect(me.body.userInfo.username).toBe('demo')

    await agent.post('/api/auth/logout').expect(200)
    await agent.get('/api/auth/me').expect(401)
  })

  it('fetches categories using the saved session', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          user_info: { auth: 1, username: 'demo', status: 'Active' },
          server_info: {},
        }),
      )
      .mockResolvedValueOnce(Response.json([{ category_id: '1', category_name: 'News' }]))

    vi.stubGlobal('fetch', fetchMock)

    const agent = request.agent(createServer())
    await agent
      .post('/api/auth/login')
      .send({ serverUrl: 'http://panel.test', username: 'demo', password: 'secret' })
      .expect(200)

    const categories = await agent.get('/api/xtream/categories?type=live').expect(200)
    expect(categories.body).toEqual([{ category_id: '1', category_name: 'News' }])
    expect(String(fetchMock.mock.calls[1][0])).toContain('action=get_live_categories')
  })

  it('fetches streams with a category filter', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(activePayload))
      .mockResolvedValueOnce(Response.json([{ stream_id: 2, name: 'World News' }]))

    vi.stubGlobal('fetch', fetchMock)

    const agent = request.agent(createServer())
    await agent
      .post('/api/auth/login')
      .send({ serverUrl: 'http://panel.test', username: 'demo', password: 'secret' })
      .expect(200)

    const streams = await agent.get('/api/xtream/streams?type=live&categoryId=7').expect(200)
    expect(streams.body).toEqual([{ stream_id: 2, name: 'World News' }])
    expect(String(fetchMock.mock.calls[1][0])).toContain('category_id=7')
  })

  it('rejects invalid content types', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(activePayload)))

    const agent = request.agent(createServer())
    await agent
      .post('/api/auth/login')
      .send({ serverUrl: 'http://panel.test', username: 'demo', password: 'secret' })
      .expect(200)

    await agent.get('/api/xtream/streams?type=bad').expect(400)
  })

  it('fetches series, VOD, and EPG details', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(activePayload))
      .mockResolvedValueOnce(Response.json({ episodes: { 1: [{ id: 9, title: 'Pilot' }] } }))
      .mockResolvedValueOnce(Response.json({ info: { name: 'Film' } }))
      .mockResolvedValueOnce(Response.json([{ title: 'Now' }]))

    vi.stubGlobal('fetch', fetchMock)

    const agent = request.agent(createServer())
    await agent
      .post('/api/auth/login')
      .send({ serverUrl: 'http://panel.test', username: 'demo', password: 'secret' })
      .expect(200)

    await agent.get('/api/xtream/series/77').expect(200)
    await agent.get('/api/xtream/vod/88').expect(200)
    const epg = await agent.get('/api/xtream/epg?epgId=bbc.one&limit=1').expect(200)
    expect(epg.body).toEqual([{ title: 'Now' }])
    expect(String(fetchMock.mock.calls[3][0])).toContain('/epg.php')
  })

  it('returns an empty EPG payload when no EPG id is provided', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(activePayload)))

    const agent = request.agent(createServer())
    await agent
      .post('/api/auth/login')
      .send({ serverUrl: 'http://panel.test', username: 'demo', password: 'secret' })
      .expect(200)

    const epg = await agent.get('/api/xtream/epg').expect(200)
    expect(epg.body).toEqual([])
  })

  it('proxies media with range support and CORS headers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          user_info: { auth: 1, username: 'demo', status: 'Active' },
          server_info: {},
        }),
      )
      .mockResolvedValueOnce(
        new Response('abcd', {
          status: 206,
          headers: {
            'content-type': 'video/mp2t',
            'content-range': 'bytes 0-3/8',
            'accept-ranges': 'bytes',
          },
        }),
      )

    vi.stubGlobal('fetch', fetchMock)

    const agent = request.agent(createServer())
    await agent
      .post('/api/auth/login')
      .send({ serverUrl: 'http://panel.test', username: 'demo', password: 'secret' })
      .expect(200)

    const media = await agent.get('/api/play/live/44.ts').set('Range', 'bytes=0-3').expect(206)
    expect(media.headers['access-control-allow-origin']).toBe('*')
    expect(media.headers['content-range']).toBe('bytes 0-3/8')
    expect(media.body.toString()).toBe('abcd')
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ range: 'bytes=0-3' })
  })

  it('rewrites HLS playlists so segment and key requests stay same-origin', async () => {
    const playlist = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-KEY:METHOD=AES-128,URI="keys/key.key"',
      '#EXTINF:6,',
      'segment0.ts',
      '#EXTINF:6,',
      'http://cdn.panel.test/live/demo/secret/segment1.ts',
      '#EXT-X-ENDLIST',
    ].join('\n')

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(activePayload))
      .mockResolvedValueOnce(
        new Response(playlist, {
          status: 200,
          headers: {
            'content-type': 'application/vnd.apple.mpegurl',
          },
        }),
      )

    vi.stubGlobal('fetch', fetchMock)

    const agent = request.agent(createServer())
    await agent
      .post('/api/auth/login')
      .send({ serverUrl: 'http://panel.test', username: 'demo', password: 'secret' })
      .expect(200)

    const media = await agent.get('/api/play/live/44.m3u8').expect(200)

    expect(media.text).toContain('#EXTM3U')
    expect(media.text).toContain('URI="/api/proxy-media?url=')
    expect(media.text).toContain('/api/proxy-media?url=')
    expect(media.text).not.toContain('http://cdn.panel.test')
    expect(media.text).not.toContain('\nsegment0.ts')
  })

  it('proxies rewritten HLS asset URLs with range support', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(activePayload))
      .mockResolvedValueOnce(
        new Response('segment', {
          status: 206,
          headers: {
            'content-type': 'video/mp2t',
            'content-range': 'bytes 0-6/20',
            'accept-ranges': 'bytes',
          },
        }),
      )

    vi.stubGlobal('fetch', fetchMock)

    const agent = request.agent(createServer())
    await agent
      .post('/api/auth/login')
      .send({ serverUrl: 'http://panel.test', username: 'demo', password: 'secret' })
      .expect(200)

    const encodedUrl = encodeURIComponent('http://panel.test/live/demo/secret/segment0.ts')
    const media = await agent.get(`/api/proxy-media?url=${encodedUrl}`).set('Range', 'bytes=0-6').expect(206)

    expect(media.headers['content-range']).toBe('bytes 0-6/20')
    expect(media.body.toString()).toBe('segment')
    expect(fetchMock.mock.calls[1][0]).toBe('http://panel.test/live/demo/secret/segment0.ts')
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ range: 'bytes=0-6' })
  })

  it('rejects malformed media proxy paths', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(activePayload)))

    const agent = request.agent(createServer())
    await agent
      .post('/api/auth/login')
      .send({ serverUrl: 'http://panel.test', username: 'demo', password: 'secret' })
      .expect(200)

    await agent.get('/api/play/live/bad.asset.name').expect(400)
  })
})
