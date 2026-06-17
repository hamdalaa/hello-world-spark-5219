import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ContentBrowser } from './ContentBrowser'
import type { LiveStream } from '../types/xtream'

describe('ContentBrowser', () => {
  function stubLocalStorage(getItem: (key: string) => string | null): void {
    const store = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : getItem(key)),
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
    })
  }

  it('uses the default rail width when no width has been saved, not the minimum', () => {
    stubLocalStorage(() => null)
    render(
      <ContentBrowser
        type="live"
        categories={[]}
        selectedCategoryId=""
        items={[]}
        loading={false}
        searchQuery=""
        favorites={[]}
        onSearchChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleFavorite={vi.fn()}
      />,
    )

    expect(screen.getByRole('separator', { name: /resize categories/i })).toHaveAttribute(
      'aria-valuenow',
      '220',
    )
  })

  it('loads poster images without blocking channel list scrolling', async () => {
    const items: LiveStream[] = [
      {
        stream_id: 1,
        name: 'News HD',
        stream_icon: 'http://images.test/news.png',
      },
    ]

    const { container } = render(
      <ContentBrowser
        type="live"
        categories={[]}
        selectedCategoryId=""
        items={items}
        loading={false}
        searchQuery=""
        favorites={[]}
        onSearchChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleFavorite={vi.fn()}
      />,
    )

    await waitFor(() => expect(container.querySelector('img')).toBeTruthy())
    const image = container.querySelector('img')
    expect(image).toHaveAttribute('decoding', 'async')
    expect(image).toHaveAttribute('fetchpriority', 'low')
  })

  it('keeps the category rail accessible and groups each channel action cluster', () => {
    const items: LiveStream[] = [
      {
        stream_id: 1,
        name: 'News HD',
      },
    ]

    render(
      <ContentBrowser
        type="live"
        categories={[{ category_id: 'sports', category_name: 'Sports' }]}
        selectedCategoryId=""
        items={items}
        loading={false}
        searchQuery=""
        favorites={[]}
        onSearchChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleFavorite={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Categories')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /actions for news hd/i })).toBeInTheDocument()
  })

  it('passes the channel label when saving favorites', () => {
    const onToggleFavorite = vi.fn()
    const items: LiveStream[] = [
      {
        stream_id: 1,
        name: 'News HD',
      },
    ]

    render(
      <ContentBrowser
        type="live"
        categories={[]}
        selectedCategoryId=""
        items={items}
        loading={false}
        searchQuery=""
        favorites={[]}
        onSearchChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleFavorite={onToggleFavorite}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /add favorite/i }))

    expect(onToggleFavorite).toHaveBeenCalledWith('live:1', 'News HD')
  })

  it('filters categories from the rail search without hiding All', () => {
    render(
      <ContentBrowser
        type="live"
        categories={[
          { category_id: 'sports', category_name: 'Sports' },
          { category_id: 'news', category_name: 'News' },
        ]}
        selectedCategoryId=""
        items={[]}
        loading={false}
        searchQuery=""
        favorites={[]}
        onSearchChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleFavorite={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'spo' } })

    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sports/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /news/i })).not.toBeInTheDocument()
  })

  it('allows resizing the category rail with the separator keyboard controls', () => {
    render(
      <ContentBrowser
        type="live"
        categories={[]}
        selectedCategoryId=""
        items={[]}
        loading={false}
        searchQuery=""
        favorites={[]}
        onSearchChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onSelectItem={vi.fn()}
        onToggleFavorite={vi.fn()}
      />,
    )

    const separator = screen.getByRole('separator', { name: /resize categories/i })
    expect(separator).toHaveAttribute('aria-valuenow', '220')

    fireEvent.keyDown(separator, { key: 'ArrowRight' })

    expect(separator).toHaveAttribute('aria-valuenow', '240')
  })
})
