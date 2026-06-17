import { FormEvent, useState } from 'react'
import { LogIn, ShieldCheck } from 'lucide-react'

import { login } from '../lib/apiClient'
import { clearRememberedLogin, loadRememberedLogin, saveRememberedLogin } from '../lib/storage'
import type { AuthResponse } from '../types/xtream'

interface LoginScreenProps {
  onAuthenticated: (auth: AuthResponse) => void
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const remembered = loadRememberedLogin()
  const [serverUrl, setServerUrl] = useState(remembered.serverUrl)
  const [username, setUsername] = useState(remembered.username)
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(Boolean(remembered.serverUrl || remembered.username))
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const auth = await login({ serverUrl, username, password })
      if (rememberMe) {
        saveRememberedLogin({ serverUrl, username })
      } else {
        clearRememberedLogin()
      }
      setPassword('')
      onAuthenticated(auth)
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Could not connect to this Xtream server')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="brand-mark">X</div>
          <div className="login-brand-copy">
            <p className="eyebrow">HTTP local web player</p>
            <h1 id="login-title">Xtream Web Player</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Server URL</span>
            <input
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              placeholder="http://provider.example:8080"
              autoComplete="url"
              spellCheck={false}
              required
            />
          </label>

          <label>
            <span>Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              spellCheck={false}
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </label>

          <div className="remember-row">
            <input
              id="remember-me"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              type="checkbox"
            />
            <span>
              <label htmlFor="remember-me">Remember me</label>
              <small>Save host and username only</small>
            </span>
          </div>

          {error && <p className="form-error">{error}</p>}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            <LogIn size={18} />
            {isSubmitting ? 'Connecting' : 'Connect'}
          </button>
        </form>

        <p className="legal-note">
          <ShieldCheck size={16} />
          Use this player only with a legal IPTV subscription. Passwords stay in the server session
          and are not saved in browser storage.
        </p>
      </section>
    </main>
  )
}
