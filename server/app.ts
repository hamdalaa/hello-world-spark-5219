import { createHmac, timingSafeEqual } from 'node:crypto'
import { Readable } from 'node:stream'
import path from 'node:path'
import compression from 'compression'
import express, { type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'

import type { ContentType, PlayKind, XtreamCredentials } from '../src/types/xtream'
import { clearSession, createSession, getSession, type SessionData } from './session'
import {
  assertContentType,
  assertPlayKind,
  buildStreamUrl,
  mapContentTypeToActions,
  normalizeServerUrl,
  requestXtreamJson,
  sanitizeUserInfo,
} from './xtream'

const loginSchema = z.object({
  serverUrl: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
})

const idSchema = z.string().regex(/^[A-Za-z0-9_-]+$/, 'Invalid stream id')
const extensionSchema = z.string().regex(/^[A-Za-z0-9]+$/, 'Invalid stream extension')

export function createServer(): express.Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(compression())
  app.use(express.json({ limit: '64kb' }))
  app.use(apiHeaders)

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true })
  })

  app.post('/api/auth/login', async (request, response, next) => {
    try {
      const body = loginSchema.parse(request.body)
      const credentials: XtreamCredentials = {
        serverUrl: normalizeServerUrl(body.serverUrl),
        username: body.username.trim(),
        password: body.password.trim(),
      }

      const authPayload = await requestXtreamJson<{
        user_info?: Record<string, unknown>
        server_info?: Record<string, unknown>
      }>(credentials, {}, { retryEmpty: false })

      const userInfo = sanitizeUserInfo(authPayload.user_info ?? {})
      const serverInfo = authPayload.server_info ?? {}

      if (Number(userInfo.auth) !== 1 || (userInfo.status && userInfo.status !== 'Active')) {
        response.status(401).json({ error: 'Authentication failed or account is not active' })
        return
      }

      const session = createSession(response, {
        credentials,
        userInfo,
        serverInfo,
      })

      response.json(toAuthResponse(session))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/auth/me', (request, response) => {
    const session = getSession(request)
    if (!session) {
      response.status(401).json({ error: 'Not authenticated' })
      return
    }

    response.json(toAuthResponse(session))
  })

  app.post('/api/auth/logout', (request, response) => {
    clearSession(request, response)
    response.json({ ok: true })
  })

  app.get('/api/xtream/categories', requireSession, async (request, response, next) => {
    try {
      const type = readContentType(request)
      const action = mapContentTypeToActions(type).categories
      const payload = await requestXtreamJson(response.locals.session.credentials, { action })
      response.json(payload)
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/xtream/streams', requireSession, async (request, response, next) => {
    try {
      const type = readContentType(request)
      const action = mapContentTypeToActions(type).streams
      const categoryId = typeof request.query.categoryId === 'string' ? request.query.categoryId : undefined
      const payload = await requestXtreamJson(response.locals.session.credentials, {
        action,
        category_id: categoryId,
      })
      response.json(payload)
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/xtream/series/:seriesId', requireSession, async (request, response, next) => {
    try {
      const seriesId = idSchema.parse(request.params.seriesId)
      const payload = await requestXtreamJson(response.locals.session.credentials, {
        action: 'get_series_info',
        series_id: seriesId,
      })
      response.json(payload)
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/xtream/vod/:vodId', requireSession, async (request, response, next) => {
    try {
      const vodId = idSchema.parse(request.params.vodId)
      const payload = await requestXtreamJson(response.locals.session.credentials, {
        action: 'get_vod_info',
        vod_id: vodId,
      })
      response.json(payload)
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/xtream/epg', requireSession, async (request, response, next) => {
    try {
      const epgId = typeof request.query.epgId === 'string' ? request.query.epgId : ''
      const limit = typeof request.query.limit === 'string' ? request.query.limit : '2'
      if (!epgId) {
        response.json([])
        return
      }

      const payload = await requestXtreamJson(
        response.locals.session.credentials,
        {
          action: 'get_simple_data_table',
          epg_id: epgId,
          limit,
        },
        { path: 'epg.php' },
      )
      response.json(payload)
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/play/:kind/:asset', requireSession, async (request, response, next) => {
    try {
      const kind = assertPlayKind(request.params.kind)
      const asset = request.params.asset
      if (typeof asset !== 'string') {
        throw new Error('Media asset is required')
      }
      const { id, extension } = parseAsset(asset)
      await proxyMedia(response.locals.session, kind, id, extension, request, response)
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/proxy-media', requireSession, async (request, response, next) => {
    try {
      const targetUrl = readMediaProxyUrl(request, response.locals.session)
      await proxyMediaUrl(response.locals.session, targetUrl, request, response)
    } catch (error) {
      next(error)
    }
  })

  if (process.env.NODE_ENV === 'production') {
    const clientDist = process.env.CLIENT_DIST ?? path.resolve(process.cwd(), 'dist')
    app.use(express.static(clientDist))
    app.use((request, response, next) => {
      if (request.method === 'GET' && !request.path.startsWith('/api')) {
        response.sendFile(path.join(clientDist, 'index.html'))
        return
      }
      next()
    })
  }

  app.use(apiErrorHandler)

  return app
}

function apiHeaders(request: Request, response: Response, next: NextFunction): void {
  if (request.path.startsWith('/api')) {
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Range')
    response.setHeader('Access-Control-Expose-Headers', 'Content-Length,Content-Range,Accept-Ranges')
  }

  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  next()
}

function requireSession(request: Request, response: Response, next: NextFunction): void {
  const session = getSession(request)
  if (!session) {
    response.status(401).json({ error: 'Not authenticated' })
    return
  }

  response.locals.session = session
  next()
}

function readContentType(request: Request): ContentType {
  return assertContentType(request.query.type)
}

function parseAsset(asset: string): { id: string; extension: string } {
  const dotIndex = asset.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === asset.length - 1) {
    throw new Error('Media asset must be formatted as id.extension')
  }

  return {
    id: idSchema.parse(asset.slice(0, dotIndex)),
    extension: extensionSchema.parse(asset.slice(dotIndex + 1).toLowerCase()),
  }
}

async function proxyMedia(
  session: SessionData,
  kind: PlayKind,
  id: string,
  extension: string,
  request: Request,
  response: Response,
): Promise<void> {
  const { credentials } = session
  const upstreamUrl = buildStreamUrl(credentials, kind, id, extension)
  await proxyUpstreamMedia(session, upstreamUrl, extension, request, response)
}

async function proxyMediaUrl(
  session: SessionData,
  upstreamUrl: string,
  request: Request,
  response: Response,
): Promise<void> {
  const extension = new URL(upstreamUrl).pathname.split('.').pop()?.toLowerCase() ?? ''
  await proxyUpstreamMedia(session, upstreamUrl, extension, request, response)
}

async function proxyUpstreamMedia(
  session: SessionData,
  upstreamUrl: string,
  extension: string,
  request: Request,
  response: Response,
): Promise<void> {
  const upstreamResponse = await fetch(upstreamUrl, {
    redirect: 'follow',
    headers: {
      accept: '*/*',
      ...(request.headers.range ? { range: request.headers.range } : {}),
      'user-agent':
        'Mozilla/5.0 (Xtream Web Player; +http://localhost) AppleWebKit/537.36 Chrome Safari',
    },
  })

  response.status(upstreamResponse.status)

  if (isHlsPlaylist(extension, upstreamResponse)) {
    const playlist = await upstreamResponse.text()
    const baseUrl = upstreamResponse.url || upstreamUrl
    response.setHeader('content-type', 'application/vnd.apple.mpegurl')
    copyHeader(upstreamResponse, response, 'cache-control')
    response.send(rewriteHlsPlaylist(playlist, baseUrl, session))
    return
  }

  copyHeader(upstreamResponse, response, 'content-type')
  copyHeader(upstreamResponse, response, 'content-length')
  copyHeader(upstreamResponse, response, 'content-range')
  copyHeader(upstreamResponse, response, 'accept-ranges')
  copyHeader(upstreamResponse, response, 'cache-control')

  if (!upstreamResponse.body) {
    response.end()
    return
  }

  Readable.fromWeb(upstreamResponse.body as ReadableStream<Uint8Array>).pipe(response)
}

function isHlsPlaylist(extension: string, upstreamResponse: globalThis.Response): boolean {
  const contentType = upstreamResponse.headers.get('content-type')?.toLowerCase() ?? ''
  return extension.toLowerCase() === 'm3u8' || contentType.includes('mpegurl')
}

function rewriteHlsPlaylist(playlist: string, baseUrl: string, session: SessionData): string {
  return playlist
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return line
      }

      if (trimmed.startsWith('#')) {
        return rewriteHlsDirectiveUris(line, baseUrl, session)
      }

      return buildSameOriginMediaUrl(trimmed, baseUrl, session)
    })
    .join('\n')
}

function rewriteHlsDirectiveUris(line: string, baseUrl: string, session: SessionData): string {
  return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
    return `URI="${buildSameOriginMediaUrl(uri, baseUrl, session)}"`
  })
}

function buildSameOriginMediaUrl(uri: string, baseUrl: string, session: SessionData): string {
  if (/^(data|blob):/i.test(uri) || uri.startsWith('/api/')) {
    return uri
  }

  const resolvedUrl = new URL(uri, baseUrl).toString()
  const encodedUrl = encodeURIComponent(resolvedUrl)
  const signature = createMediaSignature(session.id, resolvedUrl)
  return `/api/proxy-media?url=${encodedUrl}&sig=${signature}`
}

function readMediaProxyUrl(request: Request, session: SessionData): string {
  const url = typeof request.query.url === 'string' ? request.query.url : ''
  if (!url) {
    throw new Error('Media URL is required')
  }

  const parsedUrl = new URL(url)
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS media URLs are supported')
  }

  const signature = typeof request.query.sig === 'string' ? request.query.sig : ''
  if (signature && verifyMediaSignature(session.id, url, signature)) {
    return parsedUrl.toString()
  }

  const providerOrigin = new URL(normalizeServerUrl(session.credentials.serverUrl)).origin
  if (parsedUrl.origin === providerOrigin) {
    return parsedUrl.toString()
  }

  throw new Error('Invalid media proxy signature')
}

function createMediaSignature(sessionId: string, url: string): string {
  return createHmac('sha256', sessionId).update(url).digest('base64url')
}

function verifyMediaSignature(sessionId: string, url: string, signature: string): boolean {
  const expected = createMediaSignature(sessionId, url)
  const expectedBuffer = Buffer.from(expected)
  const signatureBuffer = Buffer.from(signature)
  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer)
}

function copyHeader(upstreamResponse: globalThis.Response, response: Response, header: string): void {
  const value = upstreamResponse.headers.get(header)
  if (value) {
    response.setHeader(header, value)
  }
}

function toAuthResponse(session: SessionData): { userInfo: unknown; serverInfo: unknown } {
  return {
    userInfo: session.userInfo,
    serverInfo: session.serverInfo,
  }
}

function apiErrorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction): void {
  if (response.headersSent) {
    return
  }

  if (error instanceof z.ZodError) {
    response.status(400).json({ error: error.issues[0]?.message ?? 'Invalid request' })
    return
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error'
  const status = /not authenticated/i.test(message)
    ? 401
    : /invalid|unsupported|required|must be|http/i.test(message)
      ? 400
      : 502
  response.status(status).json({ error: message })
}
