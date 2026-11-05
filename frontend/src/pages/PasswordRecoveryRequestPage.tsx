import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '../components/ui/Button'
import { Alert } from '../components/ui/Feedback'
import { Input } from '../components/ui/Field'
import { buttonStyles } from '../components/ui/button-styles'
import { recoveryRequestSchema, requestPasswordRecovery } from '../features/identity/password-recovery'

export function PasswordRecoveryRequestPage() {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const busy = useRef(false)
  const emailField = useRef<HTMLInputElement>(null)
  const summary = useRef<HTMLDivElement>(null)
  const confirmation = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (retryAt) confirmation.current?.focus() }, [retryAt])
  useEffect(() => {
    if (!retryAt) return
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))
      setRemaining(seconds)
      if (seconds === 0) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [retryAt])
  useEffect(() => { if (message) summary.current?.focus() }, [message])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await send()
  }

  async function send() {
    if (busy.current || remaining > 0) return
    const parsed = recoveryRequestSchema.safeParse({ email })
    if (!parsed.success) { setError('Informe um e-mail válido.'); emailField.current?.focus(); return }
    busy.current = true; setPending(true); setError(''); setMessage('')
    try {
      await requestPasswordRecovery(parsed.data.email)
      setSent(true); setRemaining(60); setRetryAt(Date.now() + 60_000)
    } catch {
      setMessage('Não foi possível enviar o pedido agora. Tente novamente em alguns minutos.')
    } finally { setPending(false); busy.current = false }
  }

  return <section className="mx-auto max-w-reading py-8" aria-labelledby="recovery-title">
    <h1 id="recovery-title">Recuperar senha</h1>
    {message && <Alert tone="danger" role="alert" ref={summary} tabIndex={-1}>{message}</Alert>}
    {sent ? <div className="grid gap-5">
      <h2 ref={confirmation} tabIndex={-1}>Verifique seu e-mail</h2>
      <p>Se houver uma conta ativa com este e-mail, enviaremos um link para redefinir a senha. O link vale por 30 minutos e só pode ser usado uma vez.</p>
      <Button type="button" disabled={remaining > 0} loading={pending} onClick={() => { void send() }}>Solicitar novamente</Button>
      {remaining > 0 && <p className="m-0" aria-live="off">Você pode solicitar novamente em {remaining} segundos.</p>}
      <Link className={buttonStyles()} to="/entrar">Voltar para entrar</Link>
    </div>
      : <form className="grid min-w-0 gap-5" aria-busy={pending} noValidate onSubmit={(event) => { void submit(event) }}>
        <p>Informe o e-mail da sua conta. Enviaremos um link para você escolher uma nova senha.</p>
        <Input ref={emailField} label="E-mail" name="email" type="email" autoComplete="username" required maxLength={254}
          value={email} disabled={pending} error={error} onChange={(event) => { setEmail(event.target.value); setError('') }} />
        <Button type="submit" loading={pending}>Enviar link</Button>
        <p className="m-0"><Link className="inline-flex min-h-target items-center" to="/entrar">Voltar para entrar</Link></p>
      </form>}
  </section>
}