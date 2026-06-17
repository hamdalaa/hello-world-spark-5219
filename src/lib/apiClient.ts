// Dummy client-side API. No backend. Login accepts any credentials.
// Data is loaded from /dummy-catalog.json (shape: { value: { totals, live, movies, series } }).
// Replace this file with a real API client when wiring the backend.

import type {
  AuthResponse,
  ContentType,
  SeriesInfo,
  StreamItem,
  XtreamCategory,
  XtreamCredentials,
} from '../types/xtream'

const SESSION_KEY = 'dummy.session'

interface CatalogCategoryRaw {
  name: string
  count?: number
  items: string[]
}

interface CatalogPayload {
  value: {
    live: CatalogCategoryRaw[]
    movies: CatalogCategoryRaw[]
    series: CatalogCategoryRaw[]
  }
}

interface Prepared {
  categories: Record<ContentType, XtreamCategory[]>
  streams: Record<ContentType, StreamItem[]>
}

let preparedPromise: Promise<Prepared> | null = null

async function loadCatalog(): Promise<Prepared> {
  if (!preparedPromise) {
    preparedPromise = fetch('/dummy-catalog.json')
      .then((r) => r.json() as Promise<CatalogPayload>)
      .then((data) => prepare(data))
      .catch((err) => {
        preparedPromise = null
        throw err
      })
  }
  return preparedPromise
}

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'cat'
}

function prepare(data: CatalogPayload): Prepared {
  const out: Prepared = {
    categories: { live: [], movie: [], series: [] },
    streams: { live: [], movie: [], series: [] },
  }

  const map: Array<[ContentType, CatalogCategoryRaw[]]> = [
    ['live', data.value.live ?? []],
    ['movie', data.value.movies ?? []],
    ['series', data.value.series ?? []],
  ]

  let idCounter = 1

  for (const [type, cats] of map) {
    const seen = new Set<string>()
    for (let i = 0; i < cats.length; i++) {
      const cat = cats[i]
      let id = `${type}-${slug(cat.name)}`
      let n = 1
      while (seen.has(id)) {
        id = `${type}-${slug(cat.name)}-${n++}`
      }
      seen.add(id)

      out.categories[type].push({
        category_id: id,
        category_name: cat.name,
      })

      for (const itemName of cat.items ?? []) {
        const streamId = idCounter++
        if (type === 'live') {
          out.streams.live.push({
            stream_id: streamId,
            name: itemName,
            category_id: id,
            num: streamId,
          })
        } else if (type === 'movie') {
          out.streams.movie.push({
            stream_id: streamId,
            name: itemName,
            title: itemName,
            category_id: id,
            container_extension: 'mp4',
            num: streamId,
          })
        } else {
          out.streams.series.push({
            series_id: streamId,
            name: itemName,
            title: itemName,
            category_id: id,
            num: streamId,
          })
        }
      }
    }
  }

  return out
}

function makeDummyAuth(creds: XtreamCredentials): AuthResponse {
  const username = creds.username || 'demo'
  const expDate = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
  return {
    userInfo: {
      auth: 1,
      username,
      status: 'Active',
      exp_date: String(expDate),
      is_trial: '0',
      active_cons: '0',
      max_connections: '1',
      created_at: String(Math.floor(Date.now() / 1000)),
      allowed_output_formats: ['m3u8', 'ts', 'mp4'],
    },
    serverInfo: {
      url: creds.serverUrl || 'http://demo.local',
      port: '80',
      https_port: '443',
      server_protocol: 'http',
      timezone: 'UTC',
      time_now: new Date().toISOString().replace('T', ' ').slice(0, 19),
      timestamp_now: Math.floor(Date.now() / 1000),
    },
  }
}

function readSession(): AuthResponse | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as AuthResponse) : null
  } catch {
    return null
  }
}

function writeSession(auth: AuthResponse | null): void {
  try {
    if (auth) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(auth))
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
  } catch {
    // ignore
  }
}

export async function login(credentials: XtreamCredentials): Promise<AuthResponse> {
  await new Promise((r) => setTimeout(r, 300))
  const auth = makeDummyAuth(credentials)
  writeSession(auth)
  return auth
}

export async function getSession(): Promise<AuthResponse | null> {
  return readSession()
}

export async function logout(): Promise<void> {
  writeSession(null)
}

export async function getCategories(type: ContentType): Promise<XtreamCategory[]> {
  const prepared = await loadCatalog()
  return prepared.categories[type]
}

export async function getStreams(type: ContentType, categoryId?: string): Promise<StreamItem[]> {
  const prepared = await loadCatalog()
  const all = prepared.streams[type]
  if (!categoryId) {
    return all
  }
  return all.filter((item) => (item as { category_id?: string }).category_id === categoryId)
}

export async function getSeriesInfo(seriesId: string | number): Promise<SeriesInfo> {
  const prepared = await loadCatalog()
  const series = prepared.streams.series.find(
    (s) => String((s as { series_id: string | number }).series_id) === String(seriesId),
  )
  const name = series ? (series as { name: string }).name : 'Series'
  const episodes: SeriesInfo['episodes'] = {
    '1': Array.from({ length: 6 }, (_, i) => ({
      id: `${seriesId}-s1-e${i + 1}`,
      episode_num: i + 1,
      title: `${name} — S01E${String(i + 1).padStart(2, '0')}`,
      container_extension: 'mp4',
      info: { plot: 'Demo episode (dummy data).', duration: '00:42:00' },
    })),
  }
  return {
    info: series as SeriesInfo['info'],
    seasons: [{ season_number: 1, name: 'Season 1', episode_count: 6 }],
    episodes,
  }
}

export async function getVodInfo(_vodId: string | number): Promise<unknown> {
  return { info: { plot: 'Demo movie (dummy data).' }, movie_data: {} }
}
