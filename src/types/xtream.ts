export type ContentType = 'live' | 'movie' | 'series'

export type PlayKind = ContentType

export type PlayerEngine = 'auto' | 'native' | 'hls' | 'mpegts'

export type ResolvedEngine = Exclude<PlayerEngine, 'auto'>

export interface XtreamCredentials {
  serverUrl: string
  username: string
  password: string
}

export interface XtreamUserInfo {
  auth?: number
  username?: string
  password?: string
  message?: string
  status?: string
  exp_date?: string
  is_trial?: string
  active_cons?: string
  max_connections?: string
  created_at?: string
  allowed_output_formats?: string[]
  [key: string]: unknown
}

export interface XtreamServerInfo {
  url?: string
  port?: string
  https_port?: string
  server_protocol?: string
  timezone?: string
  timestamp_now?: number
  time_now?: string
  [key: string]: unknown
}

export interface AuthResponse {
  userInfo: XtreamUserInfo
  serverInfo: XtreamServerInfo
}

export interface XtreamCategory {
  category_id: string
  category_name: string
  parent_id?: number
}

export interface LiveStream {
  stream_id: number | string
  name: string
  stream_icon?: string
  category_id?: string
  epg_channel_id?: string
  added?: string
  tv_archive?: number
  direct_source?: string
  custom_sid?: string
  num?: number
}

export interface VodStream {
  stream_id: number | string
  name: string
  title?: string
  stream_icon?: string
  cover?: string
  category_id?: string
  container_extension?: string
  rating?: string
  added?: string
  year?: string
  num?: number
}

export interface SeriesItem {
  series_id: number | string
  name: string
  title?: string
  cover?: string
  stream_icon?: string
  category_id?: string
  plot?: string
  cast?: string
  director?: string
  genre?: string
  releaseDate?: string
  last_modified?: string
  rating?: string
  num?: number
}

export interface Episode {
  id: number | string
  episode_num?: number
  title: string
  container_extension?: string
  info?: {
    movie_image?: string
    plot?: string
    duration?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface SeriesInfo {
  info?: SeriesItem
  seasons?: unknown[]
  episodes?: Record<string, Episode[]>
}

export type StreamItem = LiveStream | VodStream | SeriesItem

export interface PlaybackItem {
  kind: PlayKind
  id: string
  extension: string
  title: string
  subtitle?: string
  poster?: string
  epgId?: string
  isLive?: boolean
}
