import { OccurrenceStatus } from '../features/occurrence/OccurrenceStatus'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/ui/Button'
import { Textarea } from '../components/ui/Field'
import { Alert } from '../components/ui/Feedback'
import { Card } from '../components/ui/Card'
import { buttonStyles } from '../components/ui/button-styles'
import { useAuth } from '../features/auth/auth'
import { moderationDetailSchema, useAdministrativeQuery } from '../features/administration/administration'
import { OccurrenceGallery } from '../features/occurrence/OccurrenceGallery'
import { occurrenceDate, occurrenceStatusLabel, type Occurrence } from '../features/occurrence/occurrence'
import { moderationActions, transitionSchema } from '../features/occurrence/moderation'
import { cleanOccurrenceText } from '../features/occurrence/occurrence-text'
import { PrivateRequestError } from '../lib/api'

const actionLabels = { IN_ANALYSIS: 'Iniciar análise', RESOLVED: 'Resolver', REJECTED: 'Rejeitar', PENDING: 'Pendente' } as const
export function ModerationDetailPage() {
  const location = useLocation()
  const from: unknown = location.state?.from
  const back = typeof from === 'string' && /^\/administracao\/relatos(?:\?pagina=[1-9]\d*)?$/.test(from) ? from : '/administracao/relatos'
  const { id = '' } = useParams()
  const { state, request } = useAuth()
  const client = useQueryClient()
  const query = useAdministrativeQuery('moderation', id, `/api/admin/occurrences/${id}`, moderationDetailSchema)
  const report = query.data?.report
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const busy = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const reasonField = useRef<HTMLTextAreaElement>(null)
  const rejectionTrigger = useRef<HTMLButtonElement>(null)
  const summary = useRef<HTMLDivElement>(null)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { if (rejecting) reasonField.current?.focus() }, [rejecting])
  useEffect(() => { if (message) summary.current?.focus() }, [message])
  async function transition(target: Occurrence['status']) {
    if (busy.current || !report || state.status !== 'authenticated') return
    const command = transitionSchema.safeParse({ target, reason: target === 'REJECTED' ? reason : null })
    if (!command.success) { setReasonError(command.error.issues[0].message); reasonField.current?.focus(); return }
    busy.current = true; setPending(true); setMessage(''); setReasonError('')
    const abort = new AbortController(); controller.current = abort
    try {
      const response = await request(`/api/admin/occurrences/${report.id}/transitions`, 'POST', abort.signal, JSON.stringify(command.data), { 'Content-Type': 'application/json', 'If-Match': `"${report.version}"` })
      moderationDetailSchema.parse(await response.json())
      if (abort.signal.aborted) return
      setRejecting(false); setReason(''); setFailed(false); setMessage('Estado atualizado.')
      await client.invalidateQueries({ queryKey: ['private', state.user.id, 'moderation'] })
      await client.invalidateQueries({ queryKey: ['private', state.user.id, 'occurrence-report'] })
      await client.invalidateQueries({ queryKey: ['private', state.user.id, 'occurrences'] })
      await client.cancelQueries({ queryKey: ['public', 'occurrences'] })
      client.removeQueries({ queryKey: ['public', 'occurrences', 'detail', report.id] })
      await client.invalidateQueries({ queryKey: ['public', 'occurrences'] })
    } catch (error) {
      if (abort.signal.aborted) return
      setFailed(true)
      const conflict = error instanceof PrivateRequestError && [409, 412, 428].includes(error.status)
      setMessage(conflict ? 'Este relato mudou. Os dados foram recarregados; confira o estado antes de continuar.'
        : 'Não foi possível confirmar a mudança. Consulte o relato antes de tentar novamente.')
      await query.refetch()
    } finally { busy.current = false; if (!abort.signal.aborted) setPending(false) }
  }
  return <section className="py-8" aria-labelledby="moderation-title">
    <Link className={buttonStyles('quiet')} to={back}>← Voltar para a fila</Link>
    {query.isPending && <p role="status">Carregando relato…</p>}
    {query.isError && <Alert tone="danger" role="alert">Não conseguimos consultar este relato. <Button onClick={() => { void query.refetch() }}>Tentar novamente</Button></Alert>}
    {message && <Alert className="my-5" tone={failed ? 'warning' : 'success'} role={failed ? 'alert' : 'status'} ref={summary} tabIndex={-1}>{message}</Alert>}
    {!query.isError && report && <>
      <h1 id="moderation-title" className="mt-6">{report.title}</h1><OccurrenceStatus status={report.status} />
      <div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0"><OccurrenceGallery report={report} administrative />
      <Card><dl className="grid gap-4"><div><dt className="font-bold">Categoria</dt><dd className="m-0">{report.categoryName}</dd></div><div><dt className="font-bold">Localização</dt><dd className="m-0">{report.neighborhood} · {report.reference}</dd></div>{report.description && <div><dt className="font-bold">Detalhes</dt><dd className="m-0 whitespace-pre-wrap">{report.description}</dd></div>}<div><dt className="font-bold">Registro</dt><dd className="m-0">{occurrenceDate(report.createdAt)}</dd></div></dl></Card></div>
      <div className="min-w-0 self-start rounded-card border border-border-subtle bg-surface-raised p-4 sm:p-6"><h2 className="text-title">Acompanhar e decidir</h2>
      {moderationActions[report.status].length === 0 ? <p className="mt-6">Relato finalizado. Não há novas ações disponíveis.</p> : <div className="mt-6 flex flex-wrap gap-3">
        {moderationActions[report.status].map(target => target === 'REJECTED'
          ? <Button key={target} ref={rejectionTrigger} variant="secondary" disabled={pending || rejecting} onClick={() => { setRejecting(true); setReasonError('') }}>Rejeitar</Button>
          : <Button key={target} disabled={pending || rejecting} onClick={() => { void transition(target) }}>{actionLabels[target]}</Button>)}
      </div>}
      {rejecting && moderationActions[report.status].includes('REJECTED') && <form className="mt-6 grid gap-4" onSubmit={event => { event.preventDefault(); void transition('REJECTED') }} noValidate>
        <Textarea ref={reasonField} label="Justificativa de rejeição" required disabled={pending} value={reason} onChange={event => setReason(event.target.value)} error={reasonError} description={`O autor verá esta justificativa. Use de 10 a 500 caracteres. ${Array.from(cleanOccurrenceText(reason)).length}/500 caracteres.`} rows={5} />
        <div className="flex flex-wrap gap-3"><Button type="submit" loading={pending}>Confirmar rejeição</Button><Button variant="secondary" disabled={pending} onClick={() => { setRejecting(false); rejectionTrigger.current?.focus() }}>Cancelar rejeição</Button></div>
      </form>}
      <section className="mt-8" aria-label="Histórico de moderação"><h2>Histórico de moderação</h2>
        {query.data!.history.length === 0 ? <p>Nenhuma mudança de estado registrada.</p> : <ol className="grid gap-5 pl-6">{query.data!.history.map(event => <li key={event.id}>
          <p className="mb-1 font-bold">{occurrenceStatusLabel(event.previousStatus)} → {occurrenceStatusLabel(event.newStatus)}</p>
          <p className="text-small">{event.responsible} · <time dateTime={event.occurredAt}>{occurrenceDate(event.occurredAt)}</time></p>
          {event.reason && <p className="whitespace-pre-wrap">Justificativa: {event.reason}</p>}
        </li>)}</ol>}
      </section>
      </div></div>
    </>}
  </section>
}
