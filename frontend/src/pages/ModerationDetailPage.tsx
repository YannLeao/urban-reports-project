import { administrativeReturn } from '../features/occurrence/filters'
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
import { occurrenceDate, type Occurrence } from '../features/occurrence/occurrence'
import { moderationActions, transitionSchema } from '../features/occurrence/moderation'
import { cleanOccurrenceText } from '../features/occurrence/occurrence-text'
import { PrivateRequestError } from '../lib/api'
import { OccurrenceHistory } from '../features/occurrence/OccurrenceHistory'

const actionLabels = { ACCEPTED: 'Aceitar', RESOLVED: 'Resolver', REJECTED: 'Rejeitar', PENDING: 'Pendente' } as const
export function ModerationDetailPage() {
  const { id = '' } = useParams()
  return <ModerationDetail key={id} id={id} />
}

function ModerationDetail({ id }: { id: string }) {
  const location = useLocation()
  const from: unknown = location.state?.from
  const back = administrativeReturn(from)
  const { state, request } = useAuth()
  const client = useQueryClient()
  const query = useAdministrativeQuery('moderation', id, `/api/admin/occurrences/${id}`, moderationDetailSchema)
  const report = query.data?.report
  const [decision, setDecision] = useState<'ACCEPTED' | 'REJECTED' | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const busy = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const reasonField = useRef<HTMLTextAreaElement>(null)
  const decisionTrigger = useRef<HTMLButtonElement | null>(null)
  const summary = useRef<HTMLDivElement>(null)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { if (decision) reasonField.current?.focus() }, [decision])
  useEffect(() => { if (message) summary.current?.focus() }, [message])
  async function transition(target: Occurrence['status']) {
    if (busy.current || !report || state.status !== 'authenticated') return
    const command = transitionSchema.safeParse({ target, reason: target === 'ACCEPTED' || target === 'REJECTED' ? reason : null })
    if (!command.success) { setReasonError(command.error.issues[0].message); reasonField.current?.focus(); return }
    busy.current = true; setPending(true); setMessage(''); setReasonError('')
    const abort = new AbortController(); controller.current = abort
    try {
      const response = await request(`/api/admin/occurrences/${report.id}/transitions`, 'POST', abort.signal, JSON.stringify(command.data), { 'Content-Type': 'application/json', 'If-Match': `"${report.version}"` })
      moderationDetailSchema.parse(await response.json())
      if (abort.signal.aborted) return
      setDecision(null); setReason(''); setFailed(false); setMessage('Estado atualizado.')
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
      if (conflict) { setDecision(null); setReason(''); setReasonError('') }
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
      <h1 id="moderation-title" className="mt-6">{report.title}</h1><div role="group" aria-label="Estado atual do relato" className="flex flex-wrap items-center gap-2"><span className="text-small text-text-secondary">Estado atual</span><OccurrenceStatus status={report.status} /></div>
      <div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0"><OccurrenceGallery report={report} administrative />
      <Card><dl className="grid gap-4"><div><dt className="font-bold">Categoria</dt><dd className="m-0">{report.categoryName}</dd></div><div><dt className="font-bold">Localização</dt><dd className="m-0">{report.neighborhood} · {report.reference}</dd></div>{report.description && <div><dt className="font-bold">Detalhes</dt><dd className="m-0 whitespace-pre-wrap">{report.description}</dd></div>}<div><dt className="font-bold">Registro</dt><dd className="m-0">{occurrenceDate(report.createdAt)}</dd></div></dl></Card></div>
      <div className="min-w-0 self-start rounded-card border border-border-subtle bg-surface-raised p-4 sm:p-6"><h2 className="text-title">Acompanhar e decidir</h2>
      {moderationActions[report.status].length === 0 ? <p className="mt-6">Relato finalizado. Não há novas ações disponíveis.</p> : <div className="mt-6 flex flex-wrap gap-3">
        {moderationActions[report.status].map(target => target === 'REJECTED' || target === 'ACCEPTED'
          ? <Button key={target} variant="secondary" disabled={pending || decision !== null} onClick={event => { decisionTrigger.current = event.currentTarget; setDecision(target); setReason(''); setReasonError('') }}>{actionLabels[target]}</Button>
          : <Button key={target} disabled={pending || decision !== null} onClick={() => { void transition(target) }}>{actionLabels[target]}</Button>)}
      </div>}
      {decision && <form className="mt-6 grid gap-4" onSubmit={event => { event.preventDefault(); void transition(decision) }} noValidate>
        <h3 className="text-title">{decision === 'ACCEPTED' ? 'Aceitar relato' : 'Rejeitar relato'}</h3>
        <Textarea ref={reasonField} label={decision === 'ACCEPTED' ? 'Comentário de encaminhamento' : 'Motivo da rejeição'} required disabled={pending} value={reason} onChange={event => setReason(event.target.value)} error={reasonError} description={`O autor verá este comentário. Use de 10 a 500 caracteres. ${Array.from(cleanOccurrenceText(reason)).length}/500 caracteres.`} rows={5} />
        <div className="flex flex-wrap gap-3"><Button type="submit" loading={pending}>{decision === 'ACCEPTED' ? 'Confirmar aceitação' : 'Confirmar rejeição'}</Button><Button variant="secondary" disabled={pending} onClick={() => { setDecision(null); setReason(''); setReasonError(''); requestAnimationFrame(() => decisionTrigger.current?.focus()) }}>Cancelar</Button></div>
      </form>}
      </div></div>
      <OccurrenceHistory events={query.data!.history} currentStatus={report.status} administrative />
    </>}
  </section>
}
