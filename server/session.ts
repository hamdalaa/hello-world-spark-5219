import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { parse, serialize } from 'cookie'

import type { AuthResponse, XtreamCredentials } from '../src/types/xtream'

export const SESSION_COOKIE = 'xtream_session'

export interface SessionData extends AuthResponse {
  id: string
  credentials: XtreamCredentials
  createdAt: number
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
const sessions = new Map<string, SessionData>()

export function createSession(
  response: Response,
  data: Omit<SessionData, 'id' | 'createdAt'>,
): SessionData {
  const session: SessionData = {
    ...data,
    id: randomUUID(),
    createdAt: Date.now(),
  }

  sessions.set(session.id, session)
  response.setHeader(
    'Set-Cookie',
    serialize(SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    }),
  )

  return session
}

export function getSession(request: Request): SessionData | null {
  const cookies = parse(request.headers.cookie ?? '')
  const sessionId = cookies[SESSION_COOKIE]
  if (!sessionId) {
    return null
  }

  return sessions.get(sessionId) ?? null
}

export function clearSession(request: Request, response: Response): void {
  const cookies = parse(request.headers.cookie ?? '')
  const sessionId = cookies[SESSION_COOKIE]
  if (sessionId) {
    sessions.delete(sessionId)
  }

  response.setHeader(
    'Set-Cookie',
    serialize(SESSION_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      expires: new Date(0),
    }),
  )
}

export function clearAllSessionsForTests(): void {
  sessions.clear()
}
