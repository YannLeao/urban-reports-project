import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { postJson, privateRequest, PrivateRequestError } from '../../lib/api'
import { AuthContext, credentialSchema, loginSchema, STORAGE_KEY, userSchema, type AuthState, type Credential } from './auth'

function readCredential(): Credential | null {
  try { return credentialSchema.parse(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null')) } catch { return null }
}
function saveCredential(value: Credential | null) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch { /* In-memory session still works; reload requires login. */ }
}
export function AuthProvider({ children }: PropsWithChildren) {
  const client = useQueryClient()
  const [state, setState] = useState<AuthState>({ status: 'initializing' })
  const [credential, setCredential] = useState<Credential | null>(null)
  const current = useRef<Credential | null>(null)
  const generation = useRef(0)
  const requests = useRef(new Set<AbortController>())
  const loginPending = useRef(false)
  const logoutPending = useRef(false)

  const advance = useCallback(() => {
    generation.current++
    for (const controller of requests.current) controller.abort()
    requests.current.clear()
    void client.cancelQueries({ queryKey: ['private'] })
    client.removeQueries({ queryKey: ['private'] })
    return generation.current
  }, [client])
  const end = useCallback((message = 'Sua sessão terminou. Entre novamente.') => {
    advance(); current.current = null; setCredential(null); saveCredential(null)
    setState({ status: 'anonymous', message })
  }, [advance])

  const request = useCallback(async (path: string, method = 'GET', signal?: AbortSignal, body?: BodyInit) => {
    const snapshot = current.current
    const version = generation.current
    if (!snapshot) throw new PrivateRequestError(401)
    if (Date.parse(snapshot.expiresAt) <= Date.now()) { end(); throw new PrivateRequestError(401) }
    const controller = new AbortController()
    requests.current.add(controller)
    const cancel = () => controller.abort()
    if (signal?.aborted) cancel()
    else signal?.addEventListener('abort', cancel, { once: true })
    try {
      const response = await privateRequest(path, snapshot.accessToken, controller.signal, method, body)
      if (generation.current !== version) throw new DOMException('Sessão alterada', 'AbortError')
      return response
    } catch (error) {
      if (generation.current === version && error instanceof PrivateRequestError && error.status === 401) end()
      throw error
    } finally {
      signal?.removeEventListener('abort', cancel)
      requests.current.delete(controller)
    }
  }, [end])

  const validate = useCallback(async (snapshot: Credential | null) => {
    const version = advance()
    current.current = snapshot; setCredential(snapshot)
    if (!snapshot || Date.parse(snapshot.expiresAt) <= Date.now()) { end(snapshot ? undefined : ''); return }
    setState({ status: 'initializing' })
    try {
      const response = await request('/api/auth/me')
      const user = userSchema.parse(await response.json())
      if (version === generation.current) setState({ status: 'authenticated', user })
    } catch {
      if (version === generation.current) setState({ status: 'unavailable' })
    }
  }, [advance, end, request])

  useEffect(() => {
    void validate(readCredential())
    return () => { advance() }
  }, [validate, advance])
  useEffect(() => {
    if (!credential) return
    const check = () => { if (current.current === credential && Date.parse(credential.expiresAt) <= Date.now()) end() }
    const timer = window.setTimeout(check, Math.max(0, Date.parse(credential.expiresAt) - Date.now()))
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => { clearTimeout(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check) }
  }, [credential, end])

  async function login(email: string, password: string) {
    if (loginPending.current) return
    loginPending.current = true
    const version = advance()
    try {
      const result = loginSchema.parse(await postJson('/api/auth/login', { email, password }, 200))
      if (version !== generation.current) return
      const next = { accessToken: result.accessToken, expiresAt: result.expiresAt }
      saveCredential(next)
      // Always obtain current identity from /me, including after login.
      await validate(next)
    } finally { loginPending.current = false }
  }
  async function logout() {
    if (logoutPending.current) return
    logoutPending.current = true
    const version = generation.current
    try {
      const response = await request('/api/auth/logout', 'POST')
      if (response.status !== 204) throw new Error('Resposta inesperada')
      if (generation.current === version) end('Você saiu da sua conta.')
    } catch (error) {
      if (!(error instanceof PrivateRequestError && error.status === 401)) throw error
    } finally { logoutPending.current = false }
  }
  return <AuthContext value={{ state, login, logout, request, retry: () => { void validate(current.current) } }}>{children}</AuthContext>
}
