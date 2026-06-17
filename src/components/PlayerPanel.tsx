import { useEffect, useRef, useState } from 'react'
import {
  Maximize2,
  PauseCircle,
  PictureInPicture2,
  PlayCircle,
  Play,
  RotateCcw,
  Settings2,
  Volume2,
  VolumeX,
} from 'lucide-react'

import { engineLabels, playerEngineOptions } from '../lib/playerEngines'
import type { PlaybackItem, PlayerEngine } from '../types/xtream'

interface PlayerPanelProps {
  item: PlaybackItem | null
  engine: PlayerEngine
  liveExtension: 'm3u8' | 'ts'
  onEngineChange: (engine: PlayerEngine) => void
  onLiveExtensionChange: (extension: 'm3u8' | 'ts') => void
}

// In dummy mode we use a public demo asset so the player actually works.
const DEMO_VOD = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
const DEMO_LIVE = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

function resolveSource(item: PlaybackItem): string {
  if (item.isLive) return DEMO_LIVE
  return DEMO_VOD
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// Dummy EPG for visual demo
function dummyEpg(title: string) {
  const now = new Date()
  const start = new Date(now)
  start.setMinutes(now.getMinutes() - 18)
  const mid = new Date(start)
  mid.setMinutes(start.getMinutes() + 45)
  const end = new Date(mid)
  end.setMinutes(mid.getMinutes() + 60)
  const pct = Math.min(100, Math.max(0, ((now.getTime() - start.getTime()) / (mid.getTime() - start.getTime())) * 100))
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return {
    now: { title: `${title} — Live programme`, time: `${fmt(start)} – ${fmt(mid)}`, pct },
    next: { title: 'Up next: News bulletin', time: `${fmt(mid)} – ${fmt(end)}` },
  }
}

export function PlayerPanel({
  item,
  engine,
  liveExtension,
  onEngineChange,
  onLiveExtensionChange,
}: PlayerPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState('')
  const [isHls, setIsHls] = useState(false)

  // Load source (use hls.js for live demo HLS)
  useEffect(() => {
    setError('')
    const video = videoRef.current
    if (!video || !item) return
    const currentVideo: HTMLVideoElement = video
    const currentItem = item
    const src = resolveSource(currentItem)
    let hls: { destroy: () => void } | undefined
    let disposed = false

    const useNativeHls = currentVideo.canPlayType('application/vnd.apple.mpegurl') !== ''
    const needsHls = src.endsWith('.m3u8') && !useNativeHls

    async function load() {
      if (needsHls) {
        try {
          const Hls = (await import('hls.js')).default
          if (disposed) return
          if (Hls.isSupported()) {
            const instance = new Hls({ enableWorker: true, lowLatencyMode: currentItem.isLive === true })
            hls = instance
            instance.loadSource(src)
            instance.attachMedia(currentVideo)
            setIsHls(true)
            return
          }
        } catch {
          // fall through to native
        }
      }
      currentVideo.src = src
      setIsHls(false)
    }
    void load()

    return () => {
      disposed = true
      try { hls?.destroy() } catch { /* ignore */ }
      currentVideo.removeAttribute('src')
      currentVideo.load()
    }
  }, [item])

  // Sync UI state with video element
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTime = () => setCurrent(v.currentTime)
    const onMeta = () => setDuration(v.duration || 0)
    const onErr = () => setError('Playback unavailable in demo')
    const onVol = () => { setMuted(v.muted); setVolume(v.volume) }
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('error', onErr)
    v.addEventListener('volumechange', onVol)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('error', onErr)
      v.removeEventListener('volumechange', onVol)
    }
  }, [item])

  // Keyboard shortcuts (space, m, f, arrows)
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const v = videoRef.current
      if (!v) return
      if (e.key === ' ') { e.preventDefault(); v.paused ? v.play() : v.pause() }
      else if (e.key.toLowerCase() === 'm') { v.muted = !v.muted }
      else if (e.key.toLowerCase() === 'f') { void toggleFullscreen() }
      else if (e.key === 'ArrowRight') { v.currentTime = Math.min(v.duration || 0, v.currentTime + 5) }
      else if (e.key === 'ArrowLeft') { v.currentTime = Math.max(0, v.currentTime - 5) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item])

  async function toggleFullscreen() {
    const stage = stageRef.current
    if (!stage) return
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await stage.requestFullscreen()
    }
  }

  async function togglePip() {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else if (document.pictureInPictureEnabled) {
        await v.requestPictureInPicture()
      }
    } catch {
      // ignore
    }
  }

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }

  const epg = item?.isLive ? dummyEpg(item.title) : null
  const engineLabel = isHls ? engineLabels.hls : engineLabels.native

  if (!item) {
    return (
      <section className="player-panel idle" aria-label="Player">
        <div className="player-stage">
          <div className="player-empty">
            <div className="player-empty-icon"><Play size={28} fill="currentColor" /></div>
            <strong>Ready to play</strong>
            <span>Pick a channel, movie, or series to start.</span>
          </div>
        </div>
        <div className="now-playing">
          <div className="now-playing-copy">
            <p className="eyebrow">Now playing</p>
            <h2>Nothing selected</h2>
            <span>Use ⌘K to search across your library.</span>
          </div>
          <div className="engine-pill"><Settings2 size={14} /> Idle</div>
        </div>
      </section>
    )
  }

  return (
    <section className="player-panel" aria-label="Player">
      <div ref={stageRef} className="player-stage">
        <video
          ref={videoRef}
          className="player-video"
          autoPlay
          playsInline
          poster={item.poster}
        />
        {item.isLive && <div className="player-live-pill">LIVE</div>}
        {error && <p className="player-error">{error}</p>}

        <div className="player-controls">
          {!item.isLive && (
            <input
              className="player-scrubber"
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              onChange={(e) => {
                const v = videoRef.current
                if (v) v.currentTime = Number(e.target.value)
              }}
              aria-label="Seek"
            />
          )}
          <div className="player-controls-row">
            <button className="player-ctl" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <PauseCircle size={20} /> : <PlayCircle size={20} />}
            </button>
            {!item.isLive && (
              <button
                className="player-ctl"
                onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, v.currentTime - 10) }}
                aria-label="Back 10s"
                title="Back 10 seconds"
              >
                <RotateCcw size={16} />
              </button>
            )}
            <div className="player-volume">
              <button
                className="player-ctl"
                onClick={() => { const v = videoRef.current; if (v) v.muted = !v.muted }}
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range" min={0} max={1} step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = videoRef.current
                  if (!v) return
                  v.volume = Number(e.target.value)
                  v.muted = v.volume === 0
                }}
                aria-label="Volume"
              />
            </div>
            <span className="player-time">
              {item.isLive ? 'LIVE' : `${formatTime(current)} / ${formatTime(duration)}`}
            </span>
            <span className="player-spacer" />
            <button className="player-ctl" onClick={togglePip} aria-label="Picture in picture" title="Picture in picture (P)">
              <PictureInPicture2 size={16} />
            </button>
            <button className="player-ctl" onClick={toggleFullscreen} aria-label="Fullscreen" title="Fullscreen (F)">
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {epg && (
        <div className="epg-strip">
          <div className="epg-cell now">
            <div className="label">On now</div>
            <div className="title">{epg.now.title}</div>
            <div className="time">{epg.now.time}</div>
            <div className="epg-progress"><span style={{ width: `${epg.now.pct}%` }} /></div>
          </div>
          <div className="epg-cell">
            <div className="label">Up next</div>
            <div className="title">{epg.next.title}</div>
            <div className="time">{epg.next.time}</div>
          </div>
        </div>
      )}

      <div className="now-playing">
        <div className="now-playing-copy">
          <p className="eyebrow">{item.isLive ? 'Live channel' : 'Now playing'}</p>
          <h2>{item.title}</h2>
          <span>{item.subtitle ?? '—'}</span>
        </div>
        <div className="engine-pill"><Settings2 size={14} /> {engineLabel}</div>
      </div>

      <div className="settings-grid" role="group" aria-label="Playback settings">
        <label>
          <span>Player engine</span>
          <select value={engine} onChange={(e) => onEngineChange(e.target.value as PlayerEngine)}>
            {playerEngineOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Live format</span>
          <select value={liveExtension} onChange={(e) => onLiveExtensionChange(e.target.value as 'm3u8' | 'ts')}>
            <option value="m3u8">m3u8</option>
            <option value="ts">ts</option>
          </select>
        </label>
      </div>
    </section>
  )
}
