import type { ContentType, PlayKind, XtreamCredentials, XtreamUserInfo } from '../src/types/xtream'

export interface XtreamActionPair {
  categories: string
  streams: string
}

interface RequestOptions {
  fetchImpl?: typeof fetch
  path?: 'player_api.php' | 'epg.php'
  timeoutMs?: number
  retryEmpty?: boolean
}

export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Server URL is required')
  }

  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error('Only HTTP and HTTPS Xtream URLs are supported')
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  const parsed = new URL(withProtocol)

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS Xtream URLs are supported')
  }

  parsed.hash = ''
  parsed.search = ''
  return parsed.toString().replace(/\/$/, '')
}

export function mapContentTypeToActions(type: ContentType): XtreamActionPair {
  switch (type) {
    case 'live':
      return { categories: 'get_live_categories', streams: 'get_live_streams' }
    case 'movie':
      return { categories: 'get_vod_categories', streams: 'get_vod_streams' }
    case 'series':
      return { categories: 'get_series_categories', streams: 'get_series' }
    default:
      throw new Error(`Unsupported content type: ${String(type)}`)
  }
}

export function isEmptyXtreamPayload(data: unknown): boolean {
  if (Array.isArray(data)) {
    return data.length === 0
  }

  if (data && typeof data === 'object') {
    return Object.keys(data).length === 0
  }

  return false
}

export function buildStreamUrl(
  credentials: XtreamCredentials,
  kind: PlayKind,
  id: string | number,
  extension: string,
): string {
  const base = normalizeServerUrl(credentials.serverUrl)
  const cleanExtension = extension.replace(/^\./, '').toLowerCase()
  return `${base}/${kind}/${encodeURIComponent(credentials.username)}/${encodeURIComponent(
    credentials.password,
  )}/${encodeURIComponent(String(id))}.${encodeURIComponent(cleanExtension)}`
}

export function sanitizeUserInfo(userInfo: XtreamUserInfo = {}): XtreamUserInfo {
  const { password: _password, ...safeUserInfo } = userInfo
  return safeUserInfo
}

export function assertContentType(value: unknown): ContentType {
  if (value === 'live' || value === 'movie' || value === 'series') {
    return value
  }

  throw new Error('type must be live, movie, or series')
}

export function assertPlayKind(value: unknown): PlayKind {
  return assertContentType(value)
}

export async function requestXtreamJson<T = unknown>(
  credentials: XtreamCredentials,
  params: Record<string, string | number | undefined>,
  options: RequestOptions = {},
): Promise<T> {
  const retryEmpty = options.retryEmpty ?? true
  const attempts = retryEmpty ? 2 : 1
  let lastResult: unknown

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    lastResult = await requestProviderJson(credentials, params, options)
    if (!isEmptyXtreamPayload(lastResult)) {
      return lastResult as T
    }
  }

  return lastResult as T
}

async function requestProviderJson(
  credentials: XtreamCredentials,
  params: Record<string, string | number | undefined>,
  options: RequestOptions,
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 25_000
  const path = options.path ?? 'player_api.php'
  const url = new URL(`${normalizeServerUrl(credentials.serverUrl)}/${path}`)

  url.searchParams.set('username', credentials.username.trim())
  url.searchParams.set('password', credentials.password.trim())

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/plain,*/*',
        'user-agent':
          'Mozilla/5.0 (Xtream Web Player; +http://localhost) AppleWebKit/537.36 Chrome Safari',
      },
    })

    if (!response.ok) {
      throw new Error(`Xtream API call failed with HTTP ${response.status}`)
    }

    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}
