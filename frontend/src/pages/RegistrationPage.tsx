import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Alert } from '../components/ui/Feedback'
import { buttonStyles } from '../components/ui/button-styles'
import { ApiRequestError } from '../lib/api'
import { registerCitizen, registrationSchema } from '../features/identity/registration'

type Fields = 'name' | 'email' | 'password' | 'confirmPassword'
const initial = { name: '', email: '', password: '', confirmPassword: '' }
const labels: Record<Fields, string> = { name: 'Nome', email: 'E-mail', password: 'Senha', confirmPassword: 'Confirmar senha' }
const serverMessages: Record<string, string> = {
  INVALID_NAME: 'Use um nome de 2 a 100 caracteres, sem caracteres de controle.',
  INVALID_EMAIL: 'Informe um e-mail válido com caracteres ASCII.',
  INVALID_PASSWORD: 'Use uma senha de 15 a 128 caracteres.',
}

export function RegistrationPage() {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({})
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState(false)
  const submitting = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const summary = useRef<HTMLDivElement>(null)
  const success = useRef<HTMLHeadingElement>(null)

  function focusErrors(fields: Partial<Record<Fields, string>>) {
    requestAnimationFrame(() => {
      const first = (Object.keys(labels) as Fields[]).find((key) => fields[key])
      if (first) form.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus()
      else summary.current?.focus()
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    setMessage('')
    const result = registrationSchema.safeParse(values)
    if (!result.success) {
      const fields: Partial<Record<Fields, string>> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0] as Fields
        fields[key] ??= issue.message
      }
      setErrors(fields)
      focusErrors(fields)
      return
    }
    submitting.current = true
    setPending(true)
    setErrors({})
    try {
      await registerCitizen(result.data)
      setValues(initial)
      setCreated(true)
      requestAnimationFrame(() => success.current?.focus())
    } catch (error) {
      const fields: Partial<Record<Fields, string>> = {}
      let text = 'Não foi possível concluir o cadastro. Tente novamente mais tarde.'
      if (error instanceof ApiRequestError) {
        if (error.code === 'EMAIL_ALREADY_REGISTERED') {
          fields.email = 'Este e-mail já está cadastrado.'
          text = 'Revise o e-mail informado.'
        } else if (error.code === 'VALIDATION_ERROR') {
          for (const key of ['name', 'email', 'password'] as const) {
            const codes = error.fieldErrors?.[key]
            if (codes?.length) fields[key] = serverMessages[codes[0]] ?? 'Revise este campo.'
          }
          text = 'Revise os campos indicados.'
        } else if (error.code === 'UNCERTAIN_RESULT') {
          text = 'Não conseguimos confirmar o resultado. A conta pode ter sido criada. Ao tentar novamente, o e-mail pode aparecer como já cadastrado.'
        }
      }
      setErrors(fields)
      setMessage(`${text} Preencha a senha e a confirmação novamente.`)
      focusErrors(fields)
    } finally {
      setValues((current) => ({ ...current, password: '', confirmPassword: '' }))
      setPending(false)
      submitting.current = false
    }
  }

  return <section className="mx-auto max-w-reading py-8" aria-labelledby="registration-title">
    {created ? <>
      <h1 id="registration-title" ref={success} tabIndex={-1}>Conta criada</h1>
      <Alert tone="success">Seu cadastro foi salvo. Você ainda não está conectado.</Alert>
      <Link className={`${buttonStyles()} mt-6`} to="/">Voltar ao início</Link>
    </> : <>
      <h1 id="registration-title">Crie sua conta</h1>
      <p className="text-text-secondary">Cadastre-se no Alô Cidade com seu nome e e-mail. O cadastro não inicia uma sessão.</p>
      <form ref={form} noValidate onSubmit={(event) => { void submit(event) }} className="grid min-w-0 gap-5" aria-busy={pending}>
        {message && <Alert ref={summary} tabIndex={-1} role="alert" tone="danger">{message}</Alert>}
        {(Object.keys(labels) as Fields[]).map((key) => <Input key={key}
          name={key} label={labels[key]} required disabled={pending}
          type={key === 'password' || key === 'confirmPassword' ? 'password' : key === 'email' ? 'email' : 'text'}
          autoComplete={key === 'name' ? 'name' : key === 'email' ? 'email' : 'new-password'}
          description={key === 'password' ? 'De 15 a 128 caracteres. Você pode usar espaços e acentos.' : undefined}
          value={values[key]} error={errors[key]}
          onChange={(event) => { setValues((current) => ({ ...current, [key]: event.target.value })) }}
        />)}
        <Button type="submit" loading={pending}>{pending ? 'Criando conta…' : 'Criar conta'}</Button>
      </form>
      <Link className={`${buttonStyles('quiet')} mt-4`} to="/">Voltar ao início</Link>
    </>}
  </section>
}
