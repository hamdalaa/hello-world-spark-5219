import { useEffect, useRef, useState } from 'react'
import { Play, Settings2 } from 'lucide-react'

import {
  buildPlaybackCascade,
  canUseNativeHls,
  engineLabels,
  playerEngineOptions,
  type PlaybackAttempt,
} from '../lib/playerEngines'
import type { PlaybackItem, PlayerEngine, ResolvedEngine } from '../types/xtream'

interface PlayerPanelProps {
  item: PlaybackItem | null
  engine: PlayerEngine
  liveExtension: 'm3u8' | 'ts'
  onEngineChange: (engine: PlayerEngine) => void
  onLiveExtensionChange: (extension: 'm3u8' | 'ts') => void
}

export function PlayerPanel({
  item,
  engine,
  liveExtension,
  onEngineChange,
  onLiveExtensionChange,
}: PlayerPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [activeEngine, setActiveEngine] = useState<ResolvedEngine>('native')
  const [playerError, setPlayerError] = useState('')

  useEffect(() => {
    const video = videoRef.current
    if (!video || !item) {
      return
    }

    const currentVideo = video
    const currentItem = item
    let disposed = false
    let attemptIndex = 0
    let stopAutoplayRequest: (() => void) | undefined
    let hlsInstance: { destroy: () => void } | undefined
    let mpegtsPlayer: { destroy: () => void } | undefined
    let expectingNativeError = false
    const enginesTried: string[] = []
    let lastAttemptExtension = currentItem.extension

    const cascade = buildPlaybackCascade({
      requestedEngine: engine,
      extension: currentItem.extension,
      isLive: currentItem.isLive === true,
      canPlayNativeHls: canUseNativeHls(currentVideo),
      hasMediaSource: 'MediaSource' in window,
    })

    function sourceFor(extension: string): string {
      return `/api/play/${currentItem.kind}/${encodeURIComponent(currentItem.id)}.${encodeURIComponent(extension)}`
    }

    function setActive(engine: ResolvedEngine): void {
      setActiveEngine(engine)
    }

    function destroyHls(): void {
      try {
        hlsInstance?.destroy()
      } catch {
        // best-effort teardown
      }
      hlsInstance = undefined
    }

    function destroyMpegts(): void {
      try {
        mpegtsPlayer?.destroy()
      } catch {
        // best-effort teardown
      }
      mpegtsPlayer = undefined
    }

    function showFinalError(): void {
      if (disposed) {
        return
      }

      const tried = enginesTried.length ? enginesTried.join(' → ') : engineLabels.native
      setPlayerError(`Playback failed · ${tried} · ${lastAttemptExtension}`)
    }

    function advance(): void {
      if (disposed) {
        return
      }

      attemptIndex += 1
      if (attemptIndex >= cascade.length) {
        showFinalError()
        return
      }

      void runAttempt()
    }

    async function runAttempt(): Promise<void> {
      if (disposed) {
        return
      }

      const attempt = cascade[attemptIndex]
      if (!attempt) {
        showFinalError()
        return
      }

      enginesTried.push(engineLabels[attempt.engine])
      lastAttemptExtension = attempt.extension
      setActive(attempt.engine)
      expectingNativeError = false
      setPlayerError('')
      devLog('engine attempt', {
        engine: attempt.engine,
        extension: attempt.extension,
        source: sourceFor(attempt.extension),
      })

      try {
        if (attempt.engine === 'hls') {
          await startHls(attempt)
        } else if (attempt.engine === 'mpegts') {
          await startMpegts(attempt)
        } else {
          startNative(attempt)
        }
      } catch (error) {
        if (disposed) {
          return
        }

        devLog('engine setup threw, advancing cascade', error)
        destroyHls()
        destroyMpegts()
        advance()
      }
    }

    function startNative(attempt: PlaybackAttempt): void {
      expectingNativeError = true
      resetVideo(currentVideo)
      currentVideo.src = sourceFor(attempt.extension)
      currentVideo.load()
      stopAutoplayRequest?.()
      stopAutoplayRequest = requestAutoplay(currentVideo)
    }

    async function startHls(attempt: PlaybackAttempt): Promise<void> {
      const Hls = (await import('hls.js')).default
      if (disposed) {
        return
      }

      if (!Hls.isSupported()) {
        devLog('hls.js not supported, advancing cascade')
        advance()
        return
      }

      const instance = new Hls({ enableWorker: true, lowLatencyMode: currentItem.isLive === true })
      hlsInstance = instance
      instance.loadSource(sourceFor(attempt.extension))
      instance.attachMedia(currentVideo)
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (disposed || !data.fatal) {
          return
        }

        devLog('hls fatal error, advancing cascade', data)
        destroyHls()
        advance()
      })
      stopAutoplayRequest?.()
      stopAutoplayRequest = requestAutoplay(currentVideo)
    }

    async function startMpegts(attempt: PlaybackAttempt): Promise<void> {
      const mpegts = (await import('mpegts.js')).default
      if (disposed) {
        return
      }

      const player = mpegts.createPlayer(
        { type: 'mpegts', url: sourceFor(attempt.extension), isLive: currentItem.isLive === true },
        { enableWorker: false, enableStashBuffer: currentItem.isLive !== true },
      )
      mpegtsPlayer = player
      player.on(mpegts.Events.ERROR, () => {
        if (disposed) {
          return
        }

        devLog('mpegts error, advancing cascade')
        destroyMpegts()
        advance()
      })
      player.attachMediaElement(currentVideo)
      player.load()
      stopAutoplayRequest?.()
      stopAutoplayRequest = requestAutoplay(currentVideo)
    }

    const onVideoError = () => {
      if (disposed || !expectingNativeError) {
        return
      }

      expectingNativeError = false
      devLog('native video error, advancing cascade')
      advance()
    }

    currentVideo.addEventListener('error', onVideoError)
    resetVideo(currentVideo)
    void runAttempt()

    return () => {
      disposed = true
      stopAutoplayRequest?.()
      currentVideo.removeEventListener('error', onVideoError)
      destroyHls()
      destroyMpegts()
      resetVideo(currentVideo)
    }
  }, [engine, item])

  const pillLabel =
    engine === 'auto' ? `Auto · ${engineLabels[activeEngine]}` : engineLabels[activeEngine]

  return (
    <section className={item ? 'player-panel' : 'player-panel idle'} aria-label="Player">
      <div className="player-stage">
        {item ? (
          <>
            <video
              ref={videoRef}
              className="player-video"
              autoPlay
              controls
              playsInline
              poster={item.poster}
            />
            {playerError && <p className="player-error">{playerError}</p>}
          </>
        ) : (
          <div className="player-empty">
            <div className="player-empty-icon">
              <Play size={34} fill="currentColor" />
            </div>
            <strong>Ready to play</strong>
            <span>Select a channel from the browser.</span>
          </div>
        )}
      </div>

      <div className="now-playing">
        <div className="now-playing-copy">
          <p className="eyebrow">Now playing</p>
          <h2>{item?.title ?? 'Nothing selected'}</h2>
          <span>{item?.subtitle ?? 'Choose live, a movie, or an episode from the browser.'}</span>
        </div>
        <div className="engine-pill">
          <Settings2 size={16} />
          {pillLabel}
        </div>
      </div>

      <div className="settings-grid" role="group" aria-label="Playback settings">
        <label>
          <span>Player engine</span>
          <select value={engine} onChange={(event) => onEngineChange(event.target.value as PlayerEngine)}>
            {playerEngineOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Live format</span>
          <select
            value={liveExtension}
            onChange={(event) => onLiveExtensionChange(event.target.value as 'm3u8' | 'ts')}
          >
            <option value="m3u8">m3u8</option>
            <option value="ts">ts</option>
          </select>
        </label>
      </div>
    </section>
  )
}

function devLog(message: string, detail?: unknown): void {
  if (import.meta.env.DEV) {
    console.debug('[player]', message, detail ?? '')
  }
}

function resetVideo(video: HTMLVideoElement): void {
  video.pause()
  video.removeAttribute('src')
  video.load()
}

function requestAutoplay(video: HTMLVideoElement): () => void {
  const play = () => {
    void video.play().catch(() => {
      // Browsers can still block autoplay in rare cases; keep native controls as the fallback.
    })
  }

  play()
  video.addEventListener('canplay', play, { once: true })
  return () => video.removeEventListener('canplay', play)
}
