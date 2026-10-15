import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Alert } from '../components/ui/Feedback'
import { Card } from '../components/ui/Card'
import { Dialog } from '../components/ui/Dialog'
import { useAuth } from '../features/auth/auth'
import { registrationSchema } from '../features/identity/registration'
import { accountStatusLabels, adminPageSchema, adminSchema, invitationSchema, useAdministrativeQuery, type Admin } from '../features/administration/administration'
import { PrivateRequestError } from '../lib/api'

const identitySchema = z.object({ name: registrationSchema.shape.name, email: registrationSchema.shape.email })
export function AdminAccountsPage() {
  const { state, request } = useAuth()
  const client = useQueryClient()
  const [page, setPage] = useState(0)
  const query = useAdministrativeQuery('admins', page, `/api/super-admin/admins?page=${page}&size=20`, adminPageSchema)
  const [creating, setCreating] = useState(false)
  const createTrigger = useRef<HTMLButtonElement>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [target, setTarget] = useState<Admin | null>(null)
  const busy = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const summary = useRef<HTMLDivElement>(null)
  const nameField = useRef<HTMLInputElement>(null)
  const emailField = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { if (creating) nameField.current?.focus() }, [creating])
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { if (message) summary.current?.focus() }, [message])
  async function action(kind: 'create' | 'resend' | 'deactivate', admin?: Admin) {
    if (busy.current || state.status !== 'authenticated') return
    let payload: { name: string; email: string } | undefined
    if (kind === 'create') {
      const parsed = identitySchema.safeParse({ name, email })
      if (!parsed.success) {
        const next: Record<string, string> = {}
        for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message
        setErrors(next); (next.name ? nameField : emailField).current?.focus(); return
      }
      payload = parsed.data
    }
    busy.current = true; setPending(true); setMessage(''); setErrors({})
    const abort = new AbortController(); controller.current = abort
    try {
      const path = kind === 'create' ? '/api/super-admin/admins' : `/api/super-admin/admins/${admin!.id}/${kind === 'resend' ? 'activation-resends' : 'deactivation'}`
      const response = await request(path, 'POST', abort.signal, JSON.stringify(payload ?? {}), { 'Content-Type': 'application/json' })
      const body: unknown = await response.json()
      if (abort.signal.aborted) return
      if (kind === 'deactivate') {
        adminSchema.parse(body); dialog.current?.close(); setFailed(false); setMessage('Administrador desativado. Sessões anteriores não concedem mais acesso.')
      } else {
        const result = invitationSchema.parse(body)
        setFailed(result.mailStatus === 'FAILED')
        setMessage(result.mailStatus === 'ACCEPTED' ? 'Convite aceito pelo servidor de e-mail. Isso não confirma o recebimento.'
          : 'Conta aguardando ativação. O envio do convite falhou. Use Reenviar convite para tentar novamente.')
        if (kind === 'create') { setName(''); setEmail(''); setCreating(false) }
      }
      await client.invalidateQueries({ queryKey: ['private', state.user.id, 'admins'] })
    } catch (error) {
      if (abort.signal.aborted) return
      setFailed(true)
      setMessage(error instanceof PrivateRequestError && error.code === 'EMAIL_ALREADY_REGISTERED' ? 'Este e-mail já pertence a uma conta. Contas existentes não podem ser promovidas.'
        : error instanceof PrivateRequestError && error.status === 409 ? 'A situação desta conta mudou. Consulte a lista novamente.'
          : 'Não foi possível confirmar a operação. Atualize a lista antes de tentar novamente.')
      dialog.current?.close()
      void client.invalidateQueries({ queryKey: ['private', state.user.id, 'admins'] })
    } finally { busy.current = false; if (!abort.signal.aborted) setPending(false) }
  }
  return <section className="py-8" aria-labelledby="admins-title">
    <h1 id="admins-title">Administradores</h1>
    <p>Consulte as contas e gerencie os convites de acesso.</p>
    <Button ref={createTrigger} disabled={pending} aria-expanded={creating} aria-controls="create-admin" onClick={() => setCreating(true)}>Criar administrador</Button>
    <section id="create-admin" hidden={!creating} className="my-6 max-w-reading rounded-card border border-border-subtle bg-surface-raised p-4 sm:p-6" aria-labelledby="create-admin-title">
    <h2 id="create-admin-title" className="text-title">Novo administrador</h2>
    <p className="text-small">Use um e-mail novo. A pessoa define a senha pelo convite.</p>
    <form onSubmit={event => { event.preventDefault(); void action('create') }} noValidate className="grid gap-4">
      <Input ref={nameField} label="Nome do administrador" autoComplete="name" required disabled={pending} value={name} onChange={event => setName(event.target.value)} error={errors.name} />
      <Input ref={emailField} label="E-mail do administrador" type="email" autoComplete="email" required disabled={pending} value={email} onChange={event => setEmail(event.target.value)} error={errors.email} />
      <Button type="submit" loading={pending}>Enviar convite</Button>
      <Button variant="quiet" disabled={pending} onClick={() => { setCreating(false); createTrigger.current?.focus() }}>Fechar formulário</Button>
    </form>
    </section>
    {message && <Alert className="mt-5" tone={failed ? 'danger' : 'info'} role={failed ? 'alert' : 'status'} ref={summary} tabIndex={-1}>{message}</Alert>}
    <h2 className="mt-8">Contas administrativas</h2>
    {query.isPending && <p role="status">Carregando administradores…</p>}
    {query.isError && <Alert tone="danger" role="alert">Não conseguimos carregar os administradores. <Button onClick={() => { void query.refetch() }}>Tentar novamente</Button></Alert>}
    {!query.isError && query.data && <>
      {query.data.items.length === 0 && <p>Nenhum administrador nesta página.</p>}
      <div className="grid gap-4 lg:grid-cols-2">{query.data.items.map(admin => <Card key={admin.id} aria-label={admin.name} density="compact" className="min-w-0 wrap-anywhere">
        <h3 className="mb-2 text-title">{admin.name}</h3><p>{admin.email}</p><p className="font-bold">{accountStatusLabels[admin.status]}</p>
        <div className="flex flex-wrap gap-3">
          {admin.status === 'PENDING_ACTIVATION' && <Button variant="secondary" aria-label={`Reenviar convite para ${admin.email}`} disabled={pending} onClick={() => { void action('resend', admin) }}>Reenviar convite</Button>}
          {admin.status !== 'DISABLED' && <Button variant="quiet" aria-label={`Desativar ${admin.email}`} disabled={pending} onClick={event => {
            trigger.current = event.currentTarget; setTarget(admin); dialog.current?.showModal(); cancel.current?.focus()
          }}>Desativar</Button>}
        </div>
      </Card>)}</div>
      <nav aria-label="Páginas de administradores" className="mt-6 flex flex-wrap items-center gap-4">
        <Button variant="secondary" disabled={pending || page === 0} onClick={() => setPage(value => value - 1)}>Anterior</Button>
        <span>Página {page + 1} de {Math.max(1, query.data.totalPages)}</span>
        <Button variant="secondary" disabled={pending || page + 1 >= query.data.totalPages} onClick={() => setPage(value => value + 1)}>Próxima</Button>
      </nav>
    </>}
    <Dialog ref={dialog} aria-labelledby="deactivate-title" onClose={() => trigger.current?.focus()} onCancel={event => { if (pending) event.preventDefault() }} className="m-auto max-w-reading rounded-card border border-border-control bg-surface-raised p-6 text-text-primary backdrop:bg-text-primary/50">
      <h2 id="deactivate-title">Desativar administrador</h2><p>{target?.name} · {target?.email}</p>
      <p>Esta conta perderá acesso. O histórico de moderação será preservado. Não há reativação por esta interface.</p>
      <div className="flex flex-wrap gap-3"><Button ref={cancel} variant="secondary" disabled={pending} onClick={() => dialog.current?.close()}>Cancelar</Button><Button loading={pending} onClick={() => { if (target) void action('deactivate', target) }}>Confirmar desativação</Button></div>
    </Dialog>
  </section>
}
