import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '../components/ui/Button'
import { Alert } from '../components/ui/Feedback'
import { PasswordField } from '../components/ui/PasswordField'
import { buttonStyles } from '../components/ui/button-styles'
import { recoveryTokenPattern, resetPassword, resetSchema } from '../features/identity/password-recovery'
import { ApiRequestError } from '../lib/api'

const invalidLink = 'Link inválido ou expirado. Solicite um novo link de recuperação.'

export function PasswordResetPage() {
  // Captura só em memória: o token nunca vai para storage nem para cache de consultas.
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const busy = useRef(false)
  const summary = useRef<HTMLDivElement>(null)
  const passwordField = useRef<HTMLInputElement>(null)
  const confirmField = useRef<HTMLInputElement>(null)
  const doneHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search) }, [])
  useEffect(() => { if (message) summary.current?.focus() }, [message])
  useEffect(() => { if (!pending && errors.password) passwordField.current?.focus() }, [pending, errors])
  useEffect(() => { if (success) doneHeading.current?.focus() }, [success])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || success) return
    const parsed = resetSchema.safeParse({ password, confirmPassword: confirmation })
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message
      setErrors(next); (next.password ? passwordField : confirmField).current?.focus(); return
    }
    busy.current = true; setPending(true); setMessage(''); setErrors({})
    try {
      await resetPassword(token, parsed.data.password)
      setToken(''); setSuccess(true)
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'INVALID_RECOVERY_LINK') setToken('')
      else if (error instanceof ApiRequestError && error.code === 'INVALID_PASSWORD') {
        setErrors({ password: 'Use de 15 a 128 caracteres, sem alterar os espaços da senha.' })
      } else if (error instanceof ApiRequestError && error.code === 'RECOVERY_RATE_LIMITED') {
        setMessage('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.')
      } else setMessage('Não foi possível confirmar a redefinição. Tente entrar com a nova senha antes de repetir; ela pode ter sido alterada.')
    } finally { setPassword(''); setConfirmation(''); busy.current = false; setPending(false) }
  }

  return <section className="mx-auto max-w-reading py-8" aria-labelledby="reset-title">
    <h1 id="reset-title">Redefinir senha</h1>
    {success ? <div className="grid gap-5">
      <h2 ref={doneHeading} tabIndex={-1}>Senha redefinida</h2>
      <p>Entre com seu e-mail e a nova senha.</p>
      <Link className={buttonStyles()} to="/entrar">Entrar</Link>
    </div>
      : !recoveryTokenPattern.test(token) ? <div className="grid gap-5">
        <Alert tone="danger" role="alert">{invalidLink}</Alert>
        <p>Se você recarregou esta página, reabra o link recebido por e-mail ou solicite outro.</p>
        <Link className={buttonStyles()} to="/esqueci-minha-senha">Solicitar novo link</Link>
      </div>
        : <form className="grid min-w-0 gap-5" aria-busy={pending} noValidate onSubmit={(event) => { void submit(event) }}>
          <p>Escolha uma nova senha para a sua conta.</p>
          <PasswordField ref={passwordField} label="Nova senha" autoComplete="new-password" required disabled={pending}
            value={password} onChange={(event) => setPassword(event.target.value)}
            description="De 15 a 128 caracteres. Espaços e acentos são permitidos." error={errors.password} />
          <PasswordField ref={confirmField} label="Confirmar nova senha" autoComplete="new-password" required disabled={pending}
            value={confirmation} onChange={(event) => setConfirmation(event.target.value)} error={errors.confirmPassword} />
          {message && <Alert tone="danger" role="alert" ref={summary} tabIndex={-1}>{message}</Alert>}
          <Button type="submit" loading={pending}>Redefinir senha</Button>
        </form>}
  </section>
}