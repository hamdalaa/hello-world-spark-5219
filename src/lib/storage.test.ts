import { describe, expect, it, beforeEach } from 'vitest'

import {
  loadContentLabels,
  loadSettings,
  loadTheme,
  saveContentLabels,
  saveTheme,
} from './storage'

describe('storage settings', () => {
  const localStorageMock = new Map<string, string>()

  beforeEach(() => {
    localStorageMock.clear()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => localStorageMock.get(key) ?? null,
        setItem: (key: string, value: string) => localStorageMock.set(key, value),
        removeItem: (key: string) => localStorageMock.delete(key),
      },
    })
  })

  it('defaults live playback to transport streams because most Xtream live channels expose .ts', () => {
    expect(loadSettings().liveExtension).toBe('ts')
  })

  it('does not keep the old m3u8 default from legacy saved settings', () => {
    window.localStorage.setItem('xtream.settings', JSON.stringify({ engine: 'auto', liveExtension: 'm3u8' }))

    expect(loadSettings().liveExtension).toBe('ts')
  })

  it('resets old unstable player engines to auto', () => {
    window.localStorage.setItem('xtream.settings.v2', JSON.stringify({ engine: 'mpegts', liveExtension: 'ts' }))

    expect(loadSettings().engine).toBe('auto')
  })

  it('persists display labels for saved channels', () => {
    saveContentLabels({ 'live:44': 'News HD' })

    expect(loadContentLabels()).toEqual({ 'live:44': 'News HD' })
  })

  it('defaults to dark mode and persists an explicit theme choice', () => {
    expect(loadTheme()).toBe('dark')

    saveTheme('light')
    expect(loadTheme()).toBe('light')

    saveTheme('dark')
    expect(loadTheme()).toBe('dark')
  })

  it('falls back to dark mode when the saved theme is unknown', () => {
    window.localStorage.setItem('xtream.theme', JSON.stringify('high-contrast'))

    expect(loadTheme()).toBe('dark')
  })
})
