import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { z } from 'zod'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Alert } from '../components/ui/Feedback'
import { buttonStyles } from '../components/ui/button-styles'
import { registrationSchema } from '../features/identity/registration'
import { ApiRequestError, postJson } from '../lib/api'

const activationSchema = z.object({ password: registrationSchema.shape.password, confirmPassword: z.string() })
  .refine(value => value.password === value.confirmPassword, { path: ['confirmPassword'], message: 'As senhas precisam ser iguais.' })
const invalidLink = 'Link inválido ou expirado. Solicite um novo convite ao responsável.'
export function AdminActivationPage() {
  // Module-free in-memory capture: never put the token in storage or a query cache.
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const [success, setSuccess] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const summary = useRef<HTMLDivElement>(null)
  const passwordField = useRef<HTMLInputElement>(null)
  const confirmField = useRef<HTMLInputElement>(null)
  useEffect(() => { window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search) }, [])
  useEffect(() => { if (message || success) summary.current?.focus() }, [message, success])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy.current || success) return
    const parsed = activationSchema.safeParse({ password, confirmPassword: confirmation })
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message
      setErrors(next); (next.password ? passwordField : confirmField).current?.focus(); return
    }
    busy.current = true; setPending(true); setMessage(''); setErrors({})
    try {
      const response = await postJson('/api/auth/admin-activations', { token, password: parsed.data.password }, 200)
      z.object({ activated: z.literal(true) }).parse(response)
      setToken(''); setSuccess(true)
    } catch (error) {
      setMessage(error instanceof ApiRequestError && error.code === 'INVALID_ACTIVATION_LINK' ? invalidLink
        : error instanceof ApiRequestError && error.code === 'INVALID_PASSWORD' ? 'Use uma senha de 15 a 128 caracteres.'
          : 'Não foi possível confirmar a ativação. Tente entrar antes de repetir; a conta pode ter sido ativada.')
    } finally { setPassword(''); setConfirmation(''); busy.current = false; setPending(false) }
  }
  return <section className="py-8" aria-labelledby="activation-title">
    <h1 id="activation-title">Ativar conta administrativa</h1>
    {success ? <><Alert tone="success" ref={summary} tabIndex={-1}>Conta ativada. Entre com seu e-mail e a senha definida.</Alert><Link className={`${buttonStyles()} mt-5`} to="/entrar">Entrar</Link></>
      : !/^[A-Za-z0-9_-]{43}$/.test(token) ? <Alert tone="danger" role="alert">{invalidLink}</Alert>
        : <form onSubmit={event => { void submit(event) }} noValidate className="grid gap-5">
          <p>Defina sua senha para começar a moderar relatos. O convite vale por 24 horas.</p>
          <Input ref={passwordField} label="Senha" type="password" autoComplete="new-password" required disabled={pending} value={password} onChange={event => setPassword(event.target.value)} description="De 15 a 128 caracteres. Espaços e acentos são permitidos." error={errors.password} />
          <Input ref={confirmField} label="Confirme a senha" type="password" autoComplete="new-password" required disabled={pending} value={confirmation} onChange={event => setConfirmation(event.target.value)} error={errors.confirmPassword} />
          {message && <Alert tone="danger" role="alert" ref={summary} tabIndex={-1}>{message}</Alert>}
          <Button type="submit" loading={pending}>Ativar conta</Button>
        </form>}
  </section>
}
