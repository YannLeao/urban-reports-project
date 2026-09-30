import { Dialog } from '../components/ui/Dialog'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../features/auth/auth'
import { PrivateRequestError } from '../lib/api'
import { OccurrencePhoto } from '../features/occurrence/OccurrencePhoto'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, StatusBadge } from '../components/ui/Feedback'
import { Card } from '../components/ui/Card'
import { buttonStyles } from '../components/ui/button-styles'
import { useOccurrence } from '../features/occurrence/useOccurrences'
import { Button } from '../components/ui/Button'
import { occurrenceDate, occurrenceStatusLabel } from '../features/occurrence/occurrence'

export function OccurrenceDetailPage() {
  const { id } = useParams()
  const { request, state } = useAuth()
  const client = useQueryClient()
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const navigate = useNavigate()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const deleting = useRef(false)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const query = useOccurrence(id)
  const report = query.data
  const loading = query.isPending
  const error = query.isError

  async function remove() {
    if (!report || deleting.current || state.status !== 'authenticated') return
    deleting.current = true; setPending(true); setNotice(null)
    try {
      const response = await request(`/api/occurrences/${report.id}`, 'DELETE', undefined, undefined, { 'If-Match': `"${report.version}"` })
      if (response.status !== 204) throw new Error('Unconfirmed delete')
      const prefix = ['private', state.user.id, 'occurrences']
      await client.cancelQueries({ queryKey: prefix })
      if (!mounted.current) return
      navigate('/meus-relatos', { replace: true, state: { deleted: true, deletedId: report.id } })
      client.removeQueries({ queryKey: [...prefix, report.id], exact: true })
      void client.invalidateQueries({ queryKey: prefix, exact: true })
    } catch (error) {
      setNotice(error instanceof PrivateRequestError && [412, 428].includes(error.status)
        ? 'Este relato mudou. Atualize a página antes de continuar.'
        : error instanceof PrivateRequestError && error.status === 409 ? 'Este relato não pode mais ser alterado.'
        : 'Não foi possível confirmar a exclusão. Consulte o relato novamente antes de tentar outra vez.')
      dialog.current?.close()
    } finally { deleting.current = false; setPending(false) }
  }

  return <section className="py-8" aria-label="Detalhe do relato">
    <div className="max-w-reading wrap-anywhere">
      <Link className={buttonStyles('quiet')} to="/meus-relatos">← Meus relatos</Link>
      {loading && <p className="mt-8" role="status">Carregando relato…</p>}
      {error && <Alert className="mt-6" tone="danger" role="alert">Não conseguimos carregar este relato. Ele pode não existir ou não pertencer à sua conta.</Alert>}
      {error && <Button className="mt-4" variant="secondary" loading={query.isFetching} onClick={() => { void query.refetch() }}>Tentar novamente</Button>}
      {error && <Link className={`${buttonStyles('secondary')} mt-4`} to="/meus-relatos">Voltar para meus relatos</Link>}
      {report && <>
        <div className="mt-8 flex flex-wrap items-start justify-between gap-3"><div><p className="mb-2 text-small font-bold text-brand-default">Relato registrado</p><h1 id="detail-title" className="mb-0">{report.title}</h1></div><StatusBadge tone="info" label={occurrenceStatusLabel(report.status)} /></div>
        <OccurrencePhoto report={report} full />
        <Card className="mt-6"><dl className="grid gap-5"><div><dt className="font-bold">Categoria</dt><dd className="m-0">{report.categoryName}</dd></div>{report.description && <div><dt className="font-bold">Detalhes</dt><dd className="m-0 whitespace-pre-wrap">{report.description}</dd></div>}<div><dt className="font-bold">Localização</dt><dd className="m-0">{report.neighborhood} · {report.reference}</dd></div><div><dt className="font-bold">Data do registro</dt><dd className="m-0">{occurrenceDate(report.createdAt)}</dd></div></dl></Card>
        {notice && <Alert tone="danger" role="alert">{notice} <Button variant="quiet" onClick={() => { void query.refetch() }}>Consultar novamente</Button></Alert>}
        {report.status === 'PENDING' && <div className="mt-5 flex flex-wrap gap-3">
          <Link className={buttonStyles()} to={`/meus-relatos/${report.id}/editar`}>Editar relato</Link>
          <Button ref={trigger} variant="quiet" className="text-feedback-danger-foreground" onClick={() => { dialog.current?.showModal(); cancel.current?.focus() }}>Excluir relato</Button>
        </div>}
        <Dialog ref={dialog} aria-labelledby="delete-title" onClose={() => trigger.current?.focus()} onCancel={event => { if (pending) event.preventDefault() }} className="m-auto max-w-reading rounded-card border border-border-control bg-surface-raised p-6 text-text-primary backdrop:bg-text-primary/50">
          <h2 id="delete-title">Excluir relato</h2><p>{report.title}</p><p>Esta ação não pode ser desfeita.</p>
          <div className="flex flex-wrap gap-3">
            <Button ref={cancel} variant="secondary" disabled={pending} onClick={() => dialog.current?.close()}>Cancelar</Button>
            <Button variant="quiet" className="text-feedback-danger-foreground" loading={pending} onClick={() => { void remove() }}>Excluir relato</Button>
          </div>
        </Dialog>
      </>}
    </div>
  </section>
}
