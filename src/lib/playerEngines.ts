import type { PlayerEngine, ResolvedEngine } from '../types/xtream'

export interface AutoEngineInput {
  extension: string
  canPlayNativeHls: boolean
  hasMediaSource: boolean
}

export interface PlayableEngineInput extends AutoEngineInput {
  requestedEngine: PlayerEngine
}

export interface PlaybackAttempt {
  engine: ResolvedEngine
  extension: string
}

export interface CascadeInput {
  requestedEngine: PlayerEngine
  extension: string
  isLive: boolean
  canPlayNativeHls: boolean
  hasMediaSource: boolean
}

export const engineLabels: Record<ResolvedEngine, string> = {
  native: 'Native',
  hls: 'hls.js',
  mpegts: 'mpegts.js',
}

export const playerEngineOptions: Array<{ value: PlayerEngine; label: string; note: string }> = [
  { value: 'auto', label: 'Auto', note: 'Best engine for this stream' },
  { value: 'native', label: 'Native', note: 'Fast browser video path' },
]

export function pickAutoEngine(input: AutoEngineInput): ResolvedEngine {
  const extension = input.extension.replace(/^\./, '').toLowerCase()

  if (extension === 'm3u8') {
    return input.canPlayNativeHls ? 'native' : 'hls'
  }

  if (extension === 'ts' || extension === 'm2ts') {
    return input.hasMediaSource ? 'mpegts' : 'native'
  }

  return 'native'
}

export function resolvePlayableEngine(input: PlayableEngineInput): ResolvedEngine {
  if (input.requestedEngine === 'auto' || input.requestedEngine === 'hls' || input.requestedEngine === 'mpegts') {
    return pickAutoEngine(input)
  }

  return 'native'
}

export function buildPlaybackCascade(input: CascadeInput): PlaybackAttempt[] {
  const extension = input.extension.replace(/^\./, '').toLowerCase()

  if (input.requestedEngine === 'native') {
    return [{ engine: 'native', extension }]
  }

  if (extension === 'ts' || extension === 'm2ts') {
    const cascade: PlaybackAttempt[] = []
    if (input.hasMediaSource) {
      cascade.push({ engine: 'mpegts', extension })
    }
    if (input.isLive) {
      cascade.push({ engine: 'hls', extension: 'm3u8' })
    }
    cascade.push({ engine: 'native', extension })
    return cascade
  }

  if (extension === 'm3u8') {
    if (input.canPlayNativeHls) {
      return [{ engine: 'native', extension: 'm3u8' }]
    }
    return [
      { engine: 'hls', extension: 'm3u8' },
      { engine: 'native', extension: 'm3u8' },
    ]
  }

  return [{ engine: 'native', extension }]
}

export function getSourceMime(extension: string): string {
  switch (extension.replace(/^\./, '').toLowerCase()) {
    case 'm3u8':
      return 'application/x-mpegURL'
    case 'mpd':
      return 'application/dash+xml'
    case 'ts':
    case 'm2ts':
      return 'video/mp2t'
    case 'mkv':
      return 'video/x-matroska'
    case 'webm':
      return 'video/webm'
    default:
      return 'video/mp4'
  }
}

export function canUseNativeHls(video: HTMLVideoElement): boolean {
  return Boolean(
    video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL'),
  )
}
