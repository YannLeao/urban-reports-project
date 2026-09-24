import { useRef, useState } from 'react'
import { useAuth } from '../features/auth/auth'
import { Button } from '../components/ui/Button'
import { Alert } from '../components/ui/Feedback'
import { Link } from 'react-router'
import { buttonStyles } from '../components/ui/button-styles'

export function AccountPage() {
  const auth = useAuth()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const summary = useRef<HTMLDivElement>(null)
  if (auth.state.status !== 'authenticated') return null
  async function logout() {
    setPending(true); setError('')
    try { await auth.logout() }
    catch {
      setError('Não foi possível confirmar o encerramento da sessão. Tente sair novamente.')
      requestAnimationFrame(() => summary.current?.focus())
    } finally { setPending(false) }
  }
  return <section className="py-8" aria-labelledby="account-title">
    <h1 id="account-title">Minha conta</h1>
    <dl className="grid gap-2"><dt className="font-bold">Nome</dt><dd className="m-0">{auth.state.user.name}</dd>
      <dt className="font-bold">E-mail</dt><dd className="m-0">{auth.state.user.email}</dd></dl>
    <Link className={buttonStyles()} to="/registrar-ocorrencia">Registrar problema</Link>
    {error && <Alert tone="danger" role="alert" ref={summary} tabIndex={-1}>{error}</Alert>}
    <Button className="mt-6" loading={pending} onClick={() => { void logout() }}>{pending ? 'Saindo…' : 'Sair'}</Button>
  </section>
}
