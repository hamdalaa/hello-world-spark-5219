import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./lib/apiClient', () => ({
  getSession: vi.fn(async () => ({
    userInfo: { auth: 1, username: 'demo-user', status: 'Active', exp_date: '1893456000' },
    serverInfo: { url: 'panel.test', port: '80' },
  })),
  getCategories: vi.fn(async () => []),
  getStreams: vi.fn(async (type: string) =>
    type === 'live' ? [{ stream_id: 44, name: 'News HD' }] : [],
  ),
  getSeriesInfo: vi.fn(async () => ({ episodes: {} })),
  logout: vi.fn(async () => undefined),
}))

import App from './App'

describe('App saved items and profile', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        length: 0,
      },
    })
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  async function renderApp() {
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.app-shell')).toBeTruthy())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Play stream' })).toBeInTheDocument(),
    )
    return container
  }

  it('shows favorite names instead of ids and only makes available items clickable', async () => {
    window.localStorage.setItem(
      'xtream.favorites',
      JSON.stringify(['live:44', 'live:99']),
    )
    window.localStorage.setItem(
      'xtream.contentLabels',
      JSON.stringify({ 'live:44': 'News HD', 'live:99': 'Old Channel' }),
    )

    await renderApp()

    // Available favorite (loaded in the live stream list) renders as a clickable chip.
    const availableChip = screen.getByRole('button', { name: 'News HD' })
    expect(availableChip).toHaveClass('chip')

    // Unavailable favorite renders as a non-interactive label, never a button.
    expect(screen.queryByRole('button', { name: 'Old Channel' })).not.toBeInTheDocument()
    const unavailableChip = screen.getByText('Old Channel')
    expect(unavailableChip).toHaveClass('chip')
    expect(unavailableChip).toHaveClass('disabled')

    // Recent panel renders its empty state instead of ids.
    expect(screen.getByText(/played items will appear here/i)).toBeInTheDocument()
  })

  it('plays the channel when an available recent chip is clicked', async () => {
    window.localStorage.setItem('xtream.recent', JSON.stringify(['live:44']))
    window.localStorage.setItem(
      'xtream.contentLabels',
      JSON.stringify({ 'live:44': 'News HD' }),
    )

    await renderApp()

    const recentChip = screen.getByRole('button', { name: 'News HD' })
    expect(recentChip).toHaveClass('chip')

    fireEvent.click(recentChip)

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'News HD' })).toBeInTheDocument(),
    )
  })

  it('closes the profile popup with the X button, the backdrop, and Escape', async () => {
    await renderApp()

    const trigger = screen.getByRole('button', { name: 'Open Xtream profile' })

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Close profile' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close profile' }))
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'))

    fireEvent.click(trigger)
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'))

    fireEvent.click(document.querySelector('.profile-backdrop') as HTMLElement)
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'))

    fireEvent.click(trigger)
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'))

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'))
  })
})
