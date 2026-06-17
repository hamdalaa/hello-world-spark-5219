import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { Heart, Play, Search } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { contentKey, getItemId, getItemMeta, getItemPoster, getItemTitle } from '../lib/content'
import type { ContentType, StreamItem, XtreamCategory } from '../types/xtream'

interface ContentBrowserProps {
  type: ContentType
  categories: XtreamCategory[]
  selectedCategoryId: string
  items: StreamItem[]
  loading: boolean
  searchQuery: string
  favorites: string[]
  onSearchChange: (value: string) => void
  onCategoryChange: (categoryId: string) => void
  onCategoryRailWidthChange?: (width: number) => void
  onSelectItem: (item: StreamItem) => void
  onToggleFavorite: (key: string, label: string) => void
}

const categoryRailWidthKey = 'xtream.categoryRailWidth'
const minCategoryRailWidth = 160
const maxCategoryRailWidth = 380
const defaultCategoryRailWidth = 220

export function ContentBrowser({
  type,
  categories,
  selectedCategoryId,
  items,
  loading,
  searchQuery,
  favorites,
  onSearchChange,
  onCategoryChange,
  onCategoryRailWidthChange,
  onSelectItem,
  onToggleFavorite,
}: ContentBrowserProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const resizeStartXRef = useRef(0)
  const resizeStartWidthRef = useRef(defaultCategoryRailWidth)
  const [categoryQuery, setCategoryQuery] = useState('')
  const [categoryRailWidth, setCategoryRailWidth] = useState(loadCategoryRailWidth)
  const [resizingCategories, setResizingCategories] = useState(false)
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const deferredCategoryQuery = useDeferredValue(categoryQuery)
  const normalizedQuery = deferredSearchQuery.trim().toLowerCase()
  const normalizedCategoryQuery = deferredCategoryQuery.trim().toLowerCase()
  const favoriteSet = useMemo(() => new Set(favorites), [favorites])

  useEffect(() => {
    onCategoryRailWidthChange?.(categoryRailWidth)
  }, [categoryRailWidth, onCategoryRailWidthChange])

  const filteredItems = useMemo(() => {
    if (!normalizedQuery) {
      return items
    }

    return items.filter((item) => getItemTitle(item).toLowerCase().includes(normalizedQuery))
  }, [items, normalizedQuery])

  const filteredCategories = useMemo(() => {
    if (!normalizedCategoryQuery) {
      return categories
    }

    return categories.filter((category) => category.category_name.toLowerCase().includes(normalizedCategoryQuery))
  }, [categories, normalizedCategoryQuery])

  const virtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 78,
    initialRect: { width: 900, height: 720 },
    overscan: 5,
  })
  const shouldVirtualize = filteredItems.length > 40
  const virtualItems = virtualizer.getVirtualItems()
  const renderedRows = shouldVirtualize
    ? virtualItems.map((virtualRow) => ({
        item: filteredItems[virtualRow.index],
        offset: virtualRow.start,
      }))
    : filteredItems.map((item, index) => ({
        item,
        offset: index * 78,
      }))

  const resizeCategories = (nextWidth: number) => {
    setCategoryRailWidth(clampCategoryRailWidth(nextWidth))
  }

  const persistCategoryRailWidth = (nextWidth: number) => {
    try {
      window.localStorage.setItem(categoryRailWidthKey, String(clampCategoryRailWidth(nextWidth)))
    } catch {
      // The resize still works when storage is unavailable.
    }
  }

  const startCategoryResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStartXRef.current = event.clientX
    resizeStartWidthRef.current = categoryRailWidth
    setResizingCategories(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveCategoryResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizingCategories) {
      return
    }

    resizeCategories(resizeStartWidthRef.current + event.clientX - resizeStartXRef.current)
  }

  const endCategoryResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizingCategories) {
      return
    }

    const nextWidth = clampCategoryRailWidth(
      resizeStartWidthRef.current + event.clientX - resizeStartXRef.current,
    )
    setResizingCategories(false)
    resizeCategories(nextWidth)
    persistCategoryRailWidth(nextWidth)
  }

  const adjustCategoryWidthFromKeyboard = (delta: number) => {
    const nextWidth = clampCategoryRailWidth(categoryRailWidth + delta)
    resizeCategories(nextWidth)
    persistCategoryRailWidth(nextWidth)
  }

  return (
    <section
      className={resizingCategories ? 'browser-shell resizing-categories' : 'browser-shell'}
      aria-label={`${type} browser`}
      style={{ '--category-rail-width': `${categoryRailWidth}px` } as CSSProperties}
    >
      <aside className="category-rail" aria-label="Categories">
        <div className="rail-heading">
          <div>
            <span>Categories</span>
            <strong>{normalizedCategoryQuery ? filteredCategories.length : categories.length}</strong>
          </div>
          <label className="category-search">
            <Search size={14} />
            <input
              value={categoryQuery}
              onChange={(event) => setCategoryQuery(event.target.value)}
              placeholder="Search"
              type="search"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </div>
        <button
          className={selectedCategoryId === '' ? 'category-item active' : 'category-item'}
          onClick={() => onCategoryChange('')}
          aria-pressed={selectedCategoryId === ''}
        >
          <span>All</span>
          <strong>{items.length}</strong>
        </button>
        {filteredCategories.map((category) => (
          <button
            key={category.category_id}
            className={selectedCategoryId === category.category_id ? 'category-item active' : 'category-item'}
            onClick={() => onCategoryChange(category.category_id)}
            aria-pressed={selectedCategoryId === category.category_id}
          >
            <span>{category.category_name}</span>
          </button>
        ))}
        {normalizedCategoryQuery && filteredCategories.length === 0 && (
          <div className="category-empty">No categories</div>
        )}
      </aside>

      <div
        className="rail-resizer"
        role="separator"
        aria-label="Resize categories"
        aria-orientation="vertical"
        aria-valuemin={minCategoryRailWidth}
        aria-valuemax={maxCategoryRailWidth}
        aria-valuenow={categoryRailWidth}
        tabIndex={0}
        onPointerDown={startCategoryResize}
        onPointerMove={moveCategoryResize}
        onPointerUp={endCategoryResize}
        onPointerCancel={endCategoryResize}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            adjustCategoryWidthFromKeyboard(-20)
          }

          if (event.key === 'ArrowRight') {
            event.preventDefault()
            adjustCategoryWidthFromKeyboard(20)
          }
        }}
      />

      <div className="content-pane">
        <div className="content-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={`Search ${type}`}
              type="search"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <span className="result-count">{filteredItems.length.toLocaleString()} items</span>
        </div>

        <div ref={parentRef} className="virtual-list">
          {loading ? (
            <div className="empty-state">Loading content...</div>
          ) : filteredItems.length === 0 ? (
            <div className="empty-state">No content found.</div>
          ) : (
            <div
              className="virtual-list-spacer"
              style={{
                height: `${shouldVirtualize ? virtualizer.getTotalSize() : filteredItems.length * 78}px`,
              }}
            >
              {renderedRows.map(({ item, offset }) => {
                const id = getItemId(item, type)
                const key = contentKey(type, id)
                const favorite = favoriteSet.has(key)

                return (
                  <ContentRow
                    key={key}
                    type={type}
                    item={item}
                    itemKey={key}
                    favorite={favorite}
                    offset={offset}
                    onSelectItem={onSelectItem}
                    onToggleFavorite={onToggleFavorite}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function loadCategoryRailWidth(): number {
  try {
    const raw = window.localStorage.getItem(categoryRailWidthKey)
    if (raw === null) {
      return defaultCategoryRailWidth
    }

    return clampCategoryRailWidth(Number(raw))
  } catch {
    return defaultCategoryRailWidth
  }
}

function clampCategoryRailWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return defaultCategoryRailWidth
  }

  return Math.min(maxCategoryRailWidth, Math.max(minCategoryRailWidth, Math.round(width)))
}

interface ContentRowProps {
  type: ContentType
  item: StreamItem
  itemKey: string
  favorite: boolean
  offset: number
  onSelectItem: (item: StreamItem) => void
  onToggleFavorite: (key: string, label: string) => void
}

const ContentRow = memo(function ContentRow({
  type,
  item,
  itemKey,
  favorite,
  offset,
  onSelectItem,
  onToggleFavorite,
}: ContentRowProps) {
  const title = getItemTitle(item)
  const poster = getItemPoster(item)
  const meta = getItemMeta(item, type)

  return (
    <article
      className="content-row"
      style={{ transform: `translate3d(0, ${offset}px, 0)` }}
    >
      <button className="poster-thumb" onClick={() => onSelectItem(item)} aria-label="Play">
        {poster ? (
          <img src={poster} alt="" loading="lazy" decoding="async" fetchPriority="low" />
        ) : (
          <span>{title.slice(0, 2).toUpperCase()}</span>
        )}
      </button>

      <button className="content-main" onClick={() => onSelectItem(item)}>
        <strong>{title}</strong>
        <span>{meta}</span>
      </button>

      <div className="content-actions" role="group" aria-label={`Actions for ${title}`}>
        <button
          className={favorite ? 'icon-button active' : 'icon-button'}
          onClick={() => onToggleFavorite(itemKey, title)}
          aria-label={favorite ? 'Remove favorite' : 'Add favorite'}
          title={favorite ? 'Remove favorite' : 'Add favorite'}
        >
          <Heart size={17} fill={favorite ? 'currentColor' : 'none'} />
        </button>

        <button
          className="icon-button strong"
          onClick={() => onSelectItem(item)}
          aria-label={type === 'series' ? 'Open series' : 'Play stream'}
          title={type === 'series' ? 'Open series' : 'Play stream'}
        >
          <Play size={17} />
        </button>
      </div>
    </article>
  )
})
