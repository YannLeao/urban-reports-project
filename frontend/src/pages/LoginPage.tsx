import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { useAuth, safeReturnPath } from '../features/auth/auth'
import { AuthUnavailable } from '../features/auth/PrivateRoute'
import { Input } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Alert } from '../components/ui/Feedback'
import { ApiRequestError } from '../lib/api'

export function LoginPage() {
  const auth = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const summary = useRef<HTMLDivElement>(null)
  const routeState: unknown = location.state
  const returnTo = safeReturnPath(routeState && typeof routeState === 'object' && 'returnTo' in routeState ? routeState.returnTo : null)
  if (auth.state.status === 'authenticated') return <Navigate to={returnTo} replace />
  if (auth.state.status === 'initializing') return <p role="status">Validando sessão…</p>
  if (auth.state.status === 'unavailable') return <AuthUnavailable />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    busy.current = true; setPending(true); setError('')
    try { await auth.login(email, password) }
    catch (failure) {
      setError(failure instanceof ApiRequestError && failure.code === 'INVALID_CREDENTIALS'
        ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar. Tente novamente.')
      requestAnimationFrame(() => summary.current?.focus())
    } finally { setPassword(''); setPending(false); busy.current = false }
  }
  return <section className="mx-auto max-w-reading py-8" aria-labelledby="login-title">
    <h1 id="login-title">Entrar</h1>
    {auth.state.message && <Alert>{auth.state.message}</Alert>}
    <form className="grid min-w-0 gap-5" aria-busy={pending} onSubmit={(event) => { void submit(event) }}>
      {error && <Alert tone="danger" role="alert" ref={summary} tabIndex={-1}>{error}</Alert>}
      <Input label="E-mail" name="email" type="email" autoComplete="username" required maxLength={254}
        value={email} disabled={pending} onChange={(event) => setEmail(event.target.value)} />
      <Input label="Senha" name="password" type="password" autoComplete="current-password" required maxLength={256}
        value={password} disabled={pending} onChange={(event) => setPassword(event.target.value)} />
      <Button type="submit" loading={pending}>{pending ? 'Entrando…' : 'Entrar'}</Button>
    </form>
    <p className="mt-6">Ainda não tem conta? <Link to="/cadastro">Criar conta</Link></p>
  </section>
}
