import type { PlayerEngine } from '../types/xtream'

export interface RememberedLogin {
  serverUrl: string
  username: string
}

export type Theme = 'dark' | 'light'

export interface PlayerSettings {
  engine: PlayerEngine
  liveExtension: 'm3u8' | 'ts'
}

const rememberedLoginKey = 'xtream.rememberedLogin'
const favoritesKey = 'xtream.favorites'
const recentKey = 'xtream.recent'
const contentLabelsKey = 'xtream.contentLabels'
const settingsKey = 'xtream.settings.v2'
const themeKey = 'xtream.theme'

const defaultSettings: PlayerSettings = {
  engine: 'auto',
  liveExtension: 'ts',
}

export function loadRememberedLogin(): RememberedLogin {
  return readJson<RememberedLogin>(rememberedLoginKey, { serverUrl: '', username: '' })
}

export function saveRememberedLogin(login: RememberedLogin): void {
  writeJson(rememberedLoginKey, login)
}

export function clearRememberedLogin(): void {
  try {
    window.localStorage.removeItem(rememberedLoginKey)
  } catch {
    // Local storage can be disabled; the app still works without persistence.
  }
}

export function loadFavorites(): string[] {
  return readJson<string[]>(favoritesKey, [])
}

export function saveFavorites(favorites: string[]): void {
  writeJson(favoritesKey, favorites.slice(0, 500))
}

export function loadRecent(): string[] {
  return readJson<string[]>(recentKey, [])
}

export function saveRecent(recent: string[]): void {
  writeJson(recentKey, recent.slice(0, 25))
}

export function loadContentLabels(): Record<string, string> {
  return readJson<Record<string, string>>(contentLabelsKey, {})
}

export function saveContentLabels(labels: Record<string, string>): void {
  writeJson(contentLabelsKey, Object.fromEntries(Object.entries(labels).slice(-500)))
}

export function loadSettings(): PlayerSettings {
  const saved = readJson<Partial<PlayerSettings>>(settingsKey, {})

  return {
    ...defaultSettings,
    ...saved,
    engine: saved.engine === 'native' ? 'native' : 'auto',
    liveExtension: saved.liveExtension === 'm3u8' ? 'm3u8' : 'ts',
  }
}

export function saveSettings(settings: PlayerSettings): void {
  writeJson(settingsKey, settings)
}

export function loadTheme(): Theme {
  const saved = readJson<Theme>(themeKey, 'dark')
  return saved === 'light' ? 'light' : 'dark'
}

export function saveTheme(theme: Theme): void {
  writeJson(themeKey, theme)
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Local storage can be disabled; the app still works without persistence.
  }
}
