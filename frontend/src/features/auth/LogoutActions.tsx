import { revealFocusedControl } from '../../lib/reveal-focus'
import { useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Feedback'
import { useAuth } from './auth'

// Shared presentation only; session revocation and cache cleanup belong to AuthProvider.
export function LogoutActions({ children }: { children?: ReactNode }) {
  const auth = useAuth()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const summary = useRef<HTMLDivElement>(null)

  async function logout() {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError('')
    try { await auth.logout() }
    catch {
      setError('Não foi possível confirmar o encerramento da sessão. Tente sair novamente.')
      requestAnimationFrame(() => summary.current?.focus())
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return <div className="flex min-w-0 flex-col gap-3" onFocusCapture={revealFocusedControl}>
    {error && <Alert tone="danger" role="alert" ref={summary} tabIndex={-1}>{error}</Alert>}
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
      {children}
      <Button className="w-full sm:w-auto" loading={pending} onClick={() => { void logout() }}>{pending ? 'Saindo…' : 'Sair'}</Button>
    </div>
  </div>
}
