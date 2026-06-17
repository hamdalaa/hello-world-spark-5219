import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Film, ListVideo, LogOut, Moon, Radio, RotateCcw, Search, Star, Sun, Tv, User, X } from 'lucide-react'

import {
  getCategories,
  getSeriesInfo,
  getSession,
  getStreams,
  logout as logoutSession,
} from './lib/apiClient'
import {
  contentKey,
  formatExpiry,
  getItemId,
  getItemTitle,
  itemToPlayback,
} from './lib/content'
import {
  loadContentLabels,
  loadFavorites,
  loadRecent,
  loadSettings,
  loadTheme,
  saveContentLabels,
  saveFavorites,
  saveRecent,
  saveSettings,
  saveTheme,
  type Theme,
} from './lib/storage'
import { ContentBrowser } from './components/ContentBrowser'
import { CommandPalette } from './components/CommandPalette'
import { LoginScreen } from './components/LoginScreen'
import { PlayerPanel } from './components/PlayerPanel'
import { SeriesDetail } from './components/SeriesDetail'
import type {
  AuthResponse,
  ContentType,
  PlaybackItem,
  PlayerEngine,
  SeriesInfo,
  SeriesItem,
  StreamItem,
  XtreamCategory,
} from './types/xtream'

const tabs: Array<{ type: ContentType; label: string; icon: typeof Radio }> = [
  { type: 'live', label: 'Live', icon: Radio },
  { type: 'movie', label: 'Movies', icon: Film },
  { type: 'series', label: 'Series', icon: Tv },
]

const emptyCategories: Record<ContentType, XtreamCategory[]> = {
  live: [],
  movie: [],
  series: [],
}

const emptyStreams: Record<ContentType, StreamItem[]> = {
  live: [],
  movie: [],
  series: [],
}

const categoryRailWidthKey = 'xtream.categoryRailWidth'
const browseStretchWidth = 360

export default function App() {
  const [auth, setAuth] = useState<AuthResponse | null>(null)
  const [booting, setBooting] = useState(true)
  const [activeType, setActiveType] = useState<ContentType>('live')
  const [categories, setCategories] = useState(emptyCategories)
  const [streams, setStreams] = useState(emptyStreams)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<PlaybackItem | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const [contentError, setContentError] = useState('')
  const [favorites, setFavorites] = useState(loadFavorites)
  const [recent, setRecent] = useState(loadRecent)
  const [contentLabels, setContentLabels] = useState(loadContentLabels)
  const [settings, setSettings] = useState(loadSettings)
  const [profileOpen, setProfileOpen] = useState(false)
  const [listMode, setListMode] = useState<'browse' | 'favorites' | 'recent'>('browse')
  const [browseStretch, setBrowseStretch] = useState(loadBrowseStretch)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [seriesState, setSeriesState] = useState<{
    series: SeriesItem
    info: SeriesInfo | null
    loading: boolean
  } | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    getSession()
      .then(setAuth)
      .finally(() => setBooting(false))
  }, [])

  useEffect(() => {
    if (!auth) {
      return
    }

    let cancelled = false
    setLoadingContent(true)
    setContentError('')

    getCategories(activeType)
      .then((nextCategories) => {
        if (cancelled) {
          return
        }

        setCategories((current) => ({ ...current, [activeType]: nextCategories }))
      })
      .catch((error) => {
        if (!cancelled) {
          setContentError(error instanceof Error ? error.message : 'Failed to load categories')
        }
      })

    getStreams(activeType, selectedCategoryId || undefined)
      .then((nextStreams) => {
        if (cancelled) {
          return
        }

        setStreams((current) => ({ ...current, [activeType]: Array.isArray(nextStreams) ? nextStreams : [] }))
      })
      .catch((error) => {
        if (!cancelled) {
          setContentError(error instanceof Error ? error.message : 'Failed to load content')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingContent(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [auth, activeType, selectedCategoryId])

  useEffect(() => {
    saveFavorites(favorites)
  }, [favorites])

  useEffect(() => {
    saveRecent(recent)
  }, [recent])

  useEffect(() => {
    saveContentLabels(contentLabels)
  }, [contentLabels])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    saveTheme(theme)
  }, [theme])

  useEffect(() => {
    if (!profileOpen) {
      return
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [profileOpen])

  const favoriteItems = useMemo(() => new Set(favorites), [favorites])
  const contentLookup = useMemo(() => {
    const next = new Map<string, { label: string; item: StreamItem; type: ContentType }>()

    for (const type of tabs.map((tab) => tab.type)) {
      for (const item of streams[type]) {
        next.set(contentKey(type, getItemId(item, type)), {
          label: getItemTitle(item),
          item,
          type,
        })
      }
    }

    return next
  }, [streams])

  const rememberContentLabel = useCallback((key: string, label: string) => {
    setContentLabels((current) => (current[key] === label ? current : { ...current, [key]: label }))
  }, [])

  const getSavedLabel = useCallback(
    (key: string) => contentLookup.get(key)?.label ?? contentLabels[key] ?? '',
    [contentLabels, contentLookup],
  )

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  const handleTabChange = (type: ContentType) => {
    setActiveType(type)
    setSelectedCategoryId('')
    setSearchQuery('')
    setListMode('browse')
    setSeriesState(null)
  }

  const toggleFavorite = useCallback((key: string, label?: string) => {
    if (label) {
      rememberContentLabel(key, label)
    }

    setFavorites((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [key, ...current],
    )
  }, [rememberContentLabel])

  const addRecent = useCallback((key: string, label: string) => {
    rememberContentLabel(key, label)
    setRecent((current) => [key, ...current.filter((item) => item !== key)].slice(0, 25))
  }, [rememberContentLabel])

  const handleSelectItem = async (item: StreamItem, itemType = activeType) => {
    const id = getItemId(item, itemType)
    const key = contentKey(itemType, id)
    const title = getItemTitle(item)

    if (itemType === 'series') {
      const series = item as SeriesItem
      setSeriesState({ series, info: null, loading: true })
      try {
        const info = await getSeriesInfo(series.series_id)
        setSeriesState({ series, info, loading: false })
      } catch {
        setSeriesState({ series, info: null, loading: false })
      }
      return
    }

    const playback = itemToPlayback(item, itemType, settings.liveExtension)
    setSelectedItem(playback)
    addRecent(key, title)
  }

  const handlePlayEpisode = (item: PlaybackItem) => {
    setSelectedItem(item)
    addRecent(contentKey('series', item.id), item.title)
  }

  const handleSavedItemClick = (key: string) => {
    const entry = contentLookup.get(key)
    if (!entry) {
      return
    }

    setActiveType(entry.type)
    setSelectedCategoryId('')
    setSearchQuery('')
    setListMode('browse')
    setSeriesState(null)
    void handleSelectItem(entry.item, entry.type)
  }

  const handleCategoryRailWidthChange = useCallback((width: number) => {
    setBrowseStretch(width >= browseStretchWidth)
  }, [])

  const logout = async () => {
    await logoutSession()
    setAuth(null)
    setSelectedItem(null)
    setSeriesState(null)
  }

  if (booting) {
    return <div className="boot-screen">Loading Xtream Web Player...</div>
  }

  if (!auth) {
    return <LoginScreen onAuthenticated={setAuth} />
  }

  const activeStreams = streams[activeType]
  const browserItems =
    listMode === 'favorites'
      ? favorites.flatMap((key) => {
          const entry = contentLookup.get(key)
          return entry?.type === activeType ? [entry.item] : []
        })
      : listMode === 'recent'
        ? recent.flatMap((key) => {
            const entry = contentLookup.get(key)
            return entry?.type === activeType ? [entry.item] : []
          })
        : activeStreams
  const stretchBrowseOnly = browseStretch && !selectedItem && !seriesState

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-line">
          <div className="brand-mark">X</div>
          <div>
            <h1>Xtream Web Player</h1>
            <span>Clean HTTP player for Xtream subscriptions</span>
          </div>
        </div>

        <div className="top-actions">
          <button
            className="icon-button theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div className={profileOpen ? 'profile-area open' : 'profile-area'}>
            <button
              className="profile-trigger"
              onClick={() => setProfileOpen((value) => !value)}
              aria-expanded={profileOpen}
              aria-label="Open Xtream profile"
              title={`${auth.userInfo.username ?? 'Xtream account'} - ${auth.userInfo.status ?? 'Connected'}`}
            >
              <span className="profile-avatar">
                <User size={17} />
              </span>
            </button>

            <section className="profile-popover" aria-label="Xtream profile">
              <div className="profile-popover-head">
                <div className="profile-popover-title">
                  <span className="profile-avatar large">
                    <User size={20} />
                  </span>
                  <div>
                    <strong>{auth.userInfo.username ?? 'Xtream account'}</strong>
                    <span>{auth.userInfo.status ?? 'Connected'}</span>
                  </div>
                </div>
                <button className="profile-close" onClick={() => setProfileOpen(false)} aria-label="Close profile">
                  <X size={16} />
                </button>
              </div>

              <div className="profile-info-grid">
                <ProfileInfo title="User info" value={auth.userInfo} />
                <ProfileInfo title="Server info" value={auth.serverInfo} />
              </div>

              <button className="profile-logout" onClick={logout}>
                <LogOut size={16} />
                Logout
              </button>
            </section>
          </div>
        </div>
      </header>

      {profileOpen && <div className="profile-backdrop" onClick={() => setProfileOpen(false)} aria-hidden="true" />}

      <main className={stretchBrowseOnly ? 'workspace browse-stretch' : 'workspace'}>
        <section className="left-column browse-column">
          <div className="browse-header">
            <nav className="tab-bar" aria-label="Content types">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.type}
                    className={activeType === tab.type ? 'tab-button active' : 'tab-button'}
                    onClick={() => handleTabChange(tab.type)}
                  >
                    <Icon size={18} />
                    {tab.label}
                  </button>
                )
              })}
            </nav>

            <div className="stats-row">
              <button type="button" onClick={() => setProfileOpen(true)}>
                <span>Expiry</span>
                <strong>{formatExpiry(auth.userInfo.exp_date)}</strong>
              </button>
              <button
                type="button"
                className={listMode === 'favorites' ? 'active' : ''}
                onClick={() => setListMode((mode) => (mode === 'favorites' ? 'browse' : 'favorites'))}
              >
                <span>Favorites</span>
                <strong>{favorites.length}</strong>
              </button>
              <button
                type="button"
                className={listMode === 'recent' ? 'active' : ''}
                onClick={() => setListMode((mode) => (mode === 'recent' ? 'browse' : 'recent'))}
              >
                <span>Recent</span>
                <strong>{recent.length}</strong>
              </button>
            </div>
          </div>

          {contentError && (
            <div className="inline-alert">
              <span>{contentError}</span>
              <button onClick={() => setSelectedCategoryId((value) => value)}>Retry</button>
            </div>
          )}

          {seriesState ? (
            <SeriesDetail
              series={seriesState.series}
              info={seriesState.info}
              loading={seriesState.loading}
              onBack={() => setSeriesState(null)}
              onPlayEpisode={handlePlayEpisode}
            />
          ) : (
            <ContentBrowser
              type={activeType}
              categories={categories[activeType]}
              selectedCategoryId={selectedCategoryId}
              items={browserItems}
              loading={loadingContent}
              searchQuery={searchQuery}
              favorites={favorites}
              onSearchChange={setSearchQuery}
              onCategoryChange={(categoryId) => {
                setListMode('browse')
                setSelectedCategoryId(categoryId)
              }}
              onCategoryRailWidthChange={handleCategoryRailWidthChange}
              onSelectItem={handleSelectItem}
              onToggleFavorite={toggleFavorite}
            />
          )}
        </section>

        <aside className="right-column">
          <PlayerPanel
            item={selectedItem}
            engine={settings.engine}
            liveExtension={settings.liveExtension}
            onEngineChange={(engine: PlayerEngine) => setSettings((current) => ({ ...current, engine }))}
            onLiveExtensionChange={(liveExtension) => setSettings((current) => ({ ...current, liveExtension }))}
          />

          <section className="compact-panel">
            <div className="panel-heading">
              <Star size={18} />
              <h2>Favorites</h2>
            </div>
            {favorites.length === 0 ? (
              <div className="panel-body empty-panel">
                <p className="muted">Save channels and videos from the browse list.</p>
              </div>
            ) : (
              <div className="panel-body chip-list">
                {favorites.slice(0, 10).map((key) => (
                  <SavedChip
                    key={key}
                    label={getSavedLabel(key)}
                    available={contentLookup.has(key)}
                    onClick={() => handleSavedItemClick(key)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="compact-panel">
            <div className="panel-heading">
              <ListVideo size={18} />
              <h2>Recent</h2>
              <button className="icon-button" onClick={() => setRecent([])} aria-label="Clear recent">
                <RotateCcw size={16} />
              </button>
            </div>
            {recent.length === 0 ? (
              <div className="panel-body empty-panel">
                <p className="muted">Played items will appear here.</p>
              </div>
            ) : (
              <div className="panel-body chip-list">
                {recent.slice(0, 10).map((key) => (
                  <SavedChip
                    key={key}
                    label={getSavedLabel(key)}
                    available={contentLookup.has(key)}
                    onClick={() => handleSavedItemClick(key)}
                  />
                ))}
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  )
}

function SavedChip({
  label,
  available,
  onClick,
}: {
  label: string
  available: boolean
  onClick: () => void
}) {
  const text = label || 'Unknown'

  if (!available) {
    return <span className="chip disabled">{text}</span>
  }

  return (
    <button className="chip" onClick={onClick}>
      {text}
    </button>
  )
}

function ProfileInfo({ title, value }: { title: string; value: Record<string, unknown> }) {
  const rows = Object.entries(value)
    .filter(([key]) => key !== 'password')
    .filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== '')

  return (
    <div className="profile-info-section">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="muted">No details returned.</p>
      ) : (
        <dl>
          {rows.map(([key, entryValue]) => (
            <div key={key}>
              <dt>{formatProfileKey(key)}</dt>
              <dd>{formatProfileValue(key, entryValue)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function loadBrowseStretch(): boolean {
  try {
    return Number(window.localStorage.getItem(categoryRailWidthKey)) >= browseStretchWidth
  } catch {
    return false
  }
}

function formatProfileKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatProfileValue(key: string, value: unknown): string {
  if (key === 'exp_date' || key === 'created_at') {
    return formatExpiry(value)
  }

  if (Array.isArray(value)) {
    return value.join(', ')
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  }

  return String(value)
}
