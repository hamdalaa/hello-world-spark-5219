import { afterEach, describe, expect, it, vi } from 'vitest'

import { getStreams } from './apiClient'

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('attaches an abort signal to content requests so loading cannot hang forever', async () => {
    const fetchMock = vi.fn(async () => Response.json([]))
    vi.stubGlobal('fetch', fetchMock)

    await getStreams('live')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/xtream/streams?type=live',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })
})
