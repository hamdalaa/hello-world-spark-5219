import type { ContentType, Episode, LiveStream, PlaybackItem, SeriesItem, StreamItem, VodStream } from '../types/xtream'

export function getItemId(item: StreamItem, type: ContentType): string {
  if (type === 'series') {
    return String((item as SeriesItem).series_id)
  }

  return String((item as LiveStream | VodStream).stream_id)
}

export function getItemTitle(item: StreamItem): string {
  return item.name || ('title' in item && item.title) || 'Untitled'
}

export function getItemPoster(item: StreamItem): string | undefined {
  if ('stream_icon' in item && item.stream_icon) {
    return item.stream_icon
  }

  if ('cover' in item && item.cover) {
    return item.cover
  }

  return undefined
}

export function getItemMeta(item: StreamItem, type: ContentType): string {
  if (type === 'live') {
    return 'Live channel'
  }

  if ('year' in item && item.year) {
    return String(item.year)
  }

  if ('genre' in item && item.genre) {
    return item.genre
  }

  return type === 'movie' ? 'Movie' : 'Series'
}

export function itemToPlayback(
  item: StreamItem,
  type: Exclude<ContentType, 'series'>,
  liveExtension: 'm3u8' | 'ts',
): PlaybackItem {
  const id = getItemId(item, type)
  const extension =
    type === 'live' ? liveExtension : (item as VodStream).container_extension?.replace(/^\./, '') || 'mp4'

  return {
    kind: type,
    id,
    extension,
    title: getItemTitle(item),
    subtitle: getItemMeta(item, type),
    poster: getItemPoster(item),
    epgId: type === 'live' ? (item as LiveStream).epg_channel_id : undefined,
    isLive: type === 'live',
  }
}

export function episodeToPlayback(series: SeriesItem, episode: Episode): PlaybackItem {
  return {
    kind: 'series',
    id: String(episode.id),
    extension: episode.container_extension?.replace(/^\./, '') || 'mp4',
    title: episode.title || `Episode ${episode.episode_num ?? ''}`.trim(),
    subtitle: series.name,
    poster: episode.info?.movie_image || getItemPoster(series),
    isLive: false,
  }
}

export function contentKey(type: ContentType, id: string | number): string {
  return `${type}:${id}`
}

export function formatExpiry(value: unknown): string {
  if (!value) {
    return 'No expiry shown'
  }

  const seconds = Number(value)
  if (!Number.isFinite(seconds)) {
    return String(value)
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(seconds * 1000))
}
