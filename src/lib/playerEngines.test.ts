import { describe, expect, it } from 'vitest'

import {
  buildPlaybackCascade,
  canUseNativeHls,
  engineLabels,
  getSourceMime,
  pickAutoEngine,
  playerEngineOptions,
  resolvePlayableEngine,
} from './playerEngines'

describe('player engine selection', () => {
  it('only exposes Auto and Native in the UI so broken engines are never selectable', () => {
    expect(playerEngineOptions.map((option) => option.value)).toEqual(['auto', 'native'])
  })

  it('uses native playback for MP4 and Safari-style native HLS support', () => {
    expect(pickAutoEngine({ extension: 'mp4', canPlayNativeHls: false, hasMediaSource: true })).toBe(
      'native',
    )
    expect(pickAutoEngine({ extension: 'm3u8', canPlayNativeHls: true, hasMediaSource: true })).toBe(
      'native',
    )
  })

  it('routes m3u8 to hls.js when the browser cannot play HLS natively', () => {
    expect(pickAutoEngine({ extension: 'm3u8', canPlayNativeHls: false, hasMediaSource: true })).toBe(
      'hls',
    )
  })

  it('routes transport streams to mpegts.js when MediaSource is available', () => {
    expect(pickAutoEngine({ extension: 'ts', canPlayNativeHls: false, hasMediaSource: true })).toBe(
      'mpegts',
    )
    expect(pickAutoEngine({ extension: '.m2ts', canPlayNativeHls: false, hasMediaSource: true })).toBe(
      'mpegts',
    )
  })

  it('falls back to native for transport streams when MediaSource is missing', () => {
    expect(pickAutoEngine({ extension: 'ts', canPlayNativeHls: false, hasMediaSource: false })).toBe(
      'native',
    )
  })

  it('keeps unknown adaptive assets on native playback', () => {
    expect(pickAutoEngine({ extension: 'mpd', canPlayNativeHls: false, hasMediaSource: true })).toBe(
      'native',
    )
    expect(pickAutoEngine({ extension: 'avi', canPlayNativeHls: false, hasMediaSource: false })).toBe(
      'native',
    )
  })

  it('respects an explicit native engine choice and never silently swaps it', () => {
    expect(
      resolvePlayableEngine({
        requestedEngine: 'native',
        extension: 'ts',
        canPlayNativeHls: false,
        hasMediaSource: true,
      }),
    ).toBe('native')
  })

  it('delegates to Auto selection when Auto is requested', () => {
    expect(
      resolvePlayableEngine({
        requestedEngine: 'auto',
        extension: 'm3u8',
        canPlayNativeHls: false,
        hasMediaSource: true,
      }),
    ).toBe('hls')
    expect(
      resolvePlayableEngine({
        requestedEngine: 'auto',
        extension: 'ts',
        canPlayNativeHls: false,
        hasMediaSource: false,
      }),
    ).toBe('native')
  })

  it('treats a stray persisted hls/mpegts choice as Auto so stale settings still play', () => {
    expect(
      resolvePlayableEngine({
        requestedEngine: 'mpegts',
        extension: 'mp4',
        canPlayNativeHls: false,
        hasMediaSource: true,
      }),
    ).toBe('native')
  })

  it('maps stream extensions to source MIME types', () => {
    expect(getSourceMime('m3u8')).toBe('application/x-mpegURL')
    expect(getSourceMime('.mpd')).toBe('application/dash+xml')
    expect(getSourceMime('ts')).toBe('video/mp2t')
    expect(getSourceMime('m2ts')).toBe('video/mp2t')
    expect(getSourceMime('mkv')).toBe('video/x-matroska')
    expect(getSourceMime('webm')).toBe('video/webm')
    expect(getSourceMime('mp4')).toBe('video/mp4')
  })

  it('labels resolved engines for the playback pill', () => {
    expect(engineLabels.native).toBe('Native')
    expect(engineLabels.hls).toBe('hls.js')
    expect(engineLabels.mpegts).toBe('mpegts.js')
  })

  it('detects native HLS support from the video element', () => {
    const video = {
      canPlayType: (mime: string) => (mime === 'application/vnd.apple.mpegurl' ? 'maybe' : ''),
    } as HTMLVideoElement

    expect(canUseNativeHls(video)).toBe(true)

    const unsupported = {
      canPlayType: () => '',
    } as unknown as HTMLVideoElement

    expect(canUseNativeHls(unsupported)).toBe(false)
  })

  describe('playback cascade', () => {
    it('tries mpegts.js then hls.js on m3u8 then native for a live ts stream', () => {
      const cascade = buildPlaybackCascade({
        requestedEngine: 'auto',
        extension: 'ts',
        isLive: true,
        canPlayNativeHls: false,
        hasMediaSource: true,
      })

      expect(cascade).toEqual([
        { engine: 'mpegts', extension: 'ts' },
        { engine: 'hls', extension: 'm3u8' },
        { engine: 'native', extension: 'ts' },
      ])
    })

    it('skips mpegts.js when MediaSource is missing and still recovers via hls.js for live ts', () => {
      const cascade = buildPlaybackCascade({
        requestedEngine: 'auto',
        extension: 'ts',
        isLive: true,
        canPlayNativeHls: false,
        hasMediaSource: false,
      })

      expect(cascade).toEqual([
        { engine: 'hls', extension: 'm3u8' },
        { engine: 'native', extension: 'ts' },
      ])
    })

    it('does not offer an m3u8 fallback for non-live ts streams', () => {
      const cascade = buildPlaybackCascade({
        requestedEngine: 'auto',
        extension: 'ts',
        isLive: false,
        canPlayNativeHls: false,
        hasMediaSource: true,
      })

      expect(cascade).toEqual([
        { engine: 'mpegts', extension: 'ts' },
        { engine: 'native', extension: 'ts' },
      ])
    })

    it('uses native HLS on Safari and hls.js elsewhere for m3u8', () => {
      const safari = buildPlaybackCascade({
        requestedEngine: 'auto',
        extension: 'm3u8',
        isLive: true,
        canPlayNativeHls: true,
        hasMediaSource: true,
      })
      expect(safari).toEqual([{ engine: 'native', extension: 'm3u8' }])

      const chrome = buildPlaybackCascade({
        requestedEngine: 'auto',
        extension: 'm3u8',
        isLive: true,
        canPlayNativeHls: false,
        hasMediaSource: true,
      })
      expect(chrome).toEqual([
        { engine: 'hls', extension: 'm3u8' },
        { engine: 'native', extension: 'm3u8' },
      ])
    })

    it('keeps mp4 and other vod formats on a single native attempt', () => {
      expect(
        buildPlaybackCascade({
          requestedEngine: 'auto',
          extension: 'mp4',
          isLive: false,
          canPlayNativeHls: false,
          hasMediaSource: true,
        }),
      ).toEqual([{ engine: 'native', extension: 'mp4' }])
    })

    it('respects an explicit native engine choice and never chains fallbacks', () => {
      expect(
        buildPlaybackCascade({
          requestedEngine: 'native',
          extension: 'ts',
          isLive: true,
          canPlayNativeHls: false,
          hasMediaSource: true,
        }),
      ).toEqual([{ engine: 'native', extension: 'ts' }])
    })
  })
})
