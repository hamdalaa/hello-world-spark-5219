import type {
  AuthResponse,
  ContentType,
  SeriesInfo,
  StreamItem,
  XtreamCategory,
  XtreamCredentials,
} from '../types/xtream'

interface ApiErrorPayload {
  error?: string
}

const requestTimeoutMs = 15_000

export async function login(credentials: XtreamCredentials): Promise<AuthResponse> {
  return requestJson<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export async function getSession(): Promise<AuthResponse | null> {
  const response = await fetch('/api/auth/me', { credentials: 'include' })
  if (response.status === 401) {
    return null
  }

  return parseJsonResponse<AuthResponse>(response)
}

export async function logout(): Promise<void> {
  await requestJson('/api/auth/logout', { method: 'POST' })
}

export async function getCategories(type: ContentType): Promise<XtreamCategory[]> {
  return requestJson<XtreamCategory[]>(`/api/xtream/categories?type=${type}`)
}

export async function getStreams(type: ContentType, categoryId?: string): Promise<StreamItem[]> {
  const params = new URLSearchParams({ type })
  if (categoryId) {
    params.set('categoryId', categoryId)
  }

  return requestJson<StreamItem[]>(`/api/xtream/streams?${params}`)
}

export async function getSeriesInfo(seriesId: string | number): Promise<SeriesInfo> {
  return requestJson<SeriesInfo>(`/api/xtream/series/${seriesId}`)
}

export async function getVodInfo(vodId: string | number): Promise<unknown> {
  return requestJson<unknown>(`/api/xtream/vod/${vodId}`)
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs)

  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    signal: controller.signal,
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  })
    .catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Content request timed out. Try again or choose another category.')
      }

      throw error
    })
    .finally(() => window.clearTimeout(timeout))

  return parseJsonResponse<T>(response)
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload as ApiErrorPayload).error
        : `Request failed with HTTP ${response.status}`
    throw new Error(message ?? `Request failed with HTTP ${response.status}`)
  }

  return payload as T
}
