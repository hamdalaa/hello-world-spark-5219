import { ArrowLeft, Play } from 'lucide-react'

import { episodeToPlayback } from '../lib/content'
import type { Episode, PlaybackItem, SeriesInfo, SeriesItem } from '../types/xtream'

interface SeriesDetailProps {
  series: SeriesItem
  info: SeriesInfo | null
  loading: boolean
  onBack: () => void
  onPlayEpisode: (item: PlaybackItem) => void
}

export function SeriesDetail({ series, info, loading, onBack, onPlayEpisode }: SeriesDetailProps) {
  const seasons = Object.entries(info?.episodes ?? {})

  return (
    <section className="series-panel">
      <header className="series-header">
        <button className="icon-button" onClick={onBack} aria-label="Back to series">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="eyebrow">Series</p>
          <h2>{series.name}</h2>
        </div>
      </header>

      {loading ? (
        <div className="empty-state">Loading episodes...</div>
      ) : seasons.length === 0 ? (
        <div className="empty-state">No episodes found.</div>
      ) : (
        <div className="season-list">
          {seasons.map(([seasonNumber, episodes]) => (
            <section key={seasonNumber} className="season-section">
              <h3>Season {seasonNumber}</h3>
              <div className="episode-list">
                {(episodes as Episode[]).map((episode) => (
                  <button
                    key={String(episode.id)}
                    className="episode-row"
                    onClick={() => onPlayEpisode(episodeToPlayback(series, episode))}
                  >
                    <span>E{episode.episode_num ?? '-'}</span>
                    <strong>{episode.title}</strong>
                    <Play size={17} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
