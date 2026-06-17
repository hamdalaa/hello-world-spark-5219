import { useEffect, useMemo, useRef, useState } from 'react'
import { Film, Radio, Search, Tv } from 'lucide-react'

import { getItemId, getItemTitle } from '../lib/content'
import type { ContentType, StreamItem } from '../types/xtream'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  streams: Record<ContentType, StreamItem[]>
  onSelect: (type: ContentType, item: StreamItem) => void
}

const typeMeta: Record<ContentType, { label: string; Icon: typeof Radio }> = {
  live: { label: 'Live', Icon: Radio },
  movie: { label: 'Movies', Icon: Film },
  series: { label: 'Series', Icon: Tv },
}

export function CommandPalette({ open, onClose, streams, onSelect }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return []
    }
    const out: Array<{ type: ContentType; item: StreamItem; title: string }> = []
    const types: ContentType[] = ['live', 'movie', 'series']
    for (const type of types) {
      for (const item of streams[type]) {
        const title = getItemTitle(item)
        if (title.toLowerCase().includes(q)) {
          out.push({ type, item, title })
          if (out.length >= 40) break
        }
      }
      if (out.length >= 40) break
    }
    return out
  }, [query, streams])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((current) => Math.min(current + 1, Math.max(results.length - 1, 0)))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((current) => Math.max(current - 1, 0))
      } else if (event.key === 'Enter') {
        const pick = results[active]
        if (pick) {
          event.preventDefault()
          onSelect(pick.type, pick.item)
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, active, onClose, onSelect])

  if (!open) return null

  return (
    <div className="cmdk-backdrop" role="dialog" aria-modal="true" aria-label="Search" onClick={onClose}>
      <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder="Search channels, movies, series…"
          />
          <kbd>esc</kbd>
        </div>

        <div className="cmdk-list">
          {!query.trim() ? (
            <div className="cmdk-empty">Start typing to search across your library.</div>
          ) : results.length === 0 ? (
            <div className="cmdk-empty">No matches for “{query}”.</div>
          ) : (
            results.map((r, i) => {
              const { Icon, label } = typeMeta[r.type]
              return (
                <button
                  key={`${r.type}-${getItemId(r.item, r.type)}`}
                  className={i === active ? 'cmdk-item active' : 'cmdk-item'}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    onSelect(r.type, r.item)
                    onClose()
                  }}
                >
                  <span className="ic"><Icon size={15} /></span>
                  <span>
                    <strong>{r.title}</strong>
                    <span>{label}</span>
                  </span>
                  <kbd>↵</kbd>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
