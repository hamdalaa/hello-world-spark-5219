import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PlayerPanel } from './PlayerPanel'
import type { PlaybackItem } from '../types/xtream'

describe('PlayerPanel', () => {
  const item: PlaybackItem = {
    kind: 'live',
    id: '44',
    extension: 'ts',
    title: 'Live Channel',
    isLive: true,
  }

  beforeEach(() => {
    Object.defineProperty(window, 'MediaSource', { configurable: true, value: undefined })
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  })

  it('starts playback automatically when a channel is selected', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)

    render(
      <PlayerPanel
        item={item}
        engine="native"
        liveExtension="ts"
        onEngineChange={vi.fn()}
        onLiveExtensionChange={vi.fn()}
      />,
    )

    await waitFor(() => expect(play).toHaveBeenCalled())
  })

  it('groups playback settings for a cleaner control surface', () => {
    render(
      <PlayerPanel
        item={null}
        engine="native"
        liveExtension="ts"
        onEngineChange={vi.fn()}
        onLiveExtensionChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('group', { name: /playback settings/i })).toBeInTheDocument()
  })

  it('keeps a ready black player surface before anything is selected', () => {
    render(
      <PlayerPanel
        item={null}
        engine="native"
        liveExtension="ts"
        onEngineChange={vi.fn()}
        onLiveExtensionChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/ready to play/i)).toBeInTheDocument()
  })
})
