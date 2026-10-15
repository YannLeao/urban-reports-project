import { OccurrenceStatus } from './OccurrenceStatus'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { buttonStyles } from '../../components/ui/button-styles'
import { PublicRequestError, PrivateRequestError } from '../../lib/api'
import { OccurrencePhoto } from './OccurrencePhoto'
import { PublicOccurrencePhoto } from './PublicOccurrencePhoto'
import { useOccurrence } from './useOccurrences'
import { usePublicOccurrence } from './usePublicOccurrences'
import type { Occurrence } from './occurrence'
import type { PublicOccurrence } from './public-occurrence'

type Props = { id: string; onUnavailable: () => void }
export function PublicMapSelection({ id, onUnavailable }: Props) {
  const query = usePublicOccurrence(id)
  const missing = query.error instanceof PublicRequestError && query.error.status === 404
  useEffect(() => { if (missing) onUnavailable() }, [missing, onUnavailable])
  if (missing) return null
  return <SelectionContent report={query.isError ? undefined : query.data} own={false} pending={query.isPending} retry={() => { void query.refetch() }} />
}
export function OwnMapSelection({ id, onUnavailable }: Props) {
  const query = useOccurrence(id)
  const missing = query.error instanceof PrivateRequestError && query.error.status === 404
  useEffect(() => { if (missing) onUnavailable() }, [missing, onUnavailable])
  if (missing) return null
  return <SelectionContent report={query.isError ? undefined : query.data} own pending={query.isPending} retry={() => { void query.refetch() }} />
}
function SelectionContent({ report, own, pending, retry }: { report?: Occurrence | PublicOccurrence; own: boolean; pending: boolean; retry: () => void }) {
  const location = useLocation()
  if (!report) return pending ? <p role="status" className="m-0">Carregando relato…</p>
    : <div><p role="alert">Não conseguimos abrir este relato.</p><Button size="compact" variant="secondary" onClick={retry}>Tentar novamente</Button></div>
  return <div className="flex min-w-0 items-center gap-3">
    {own ? <OccurrencePhoto report={report as Occurrence} thumbnail /> : <PublicOccurrencePhoto report={report} thumbnail />}
    <div className="min-w-0 flex-1">
      <OccurrenceStatus status={report.status} />
      <h2 className="mb-2 text-base">{report.title}</h2>
      <Link className={buttonStyles('primary', 'text-small', 'compact')} to={`${own ? '/meus-relatos' : '/ocorrencias'}/${report.id}`} state={{ from: `${location.pathname}${location.search}` }} aria-label={`Ver relato: ${report.title}`}>Ver relato</Link>
    </div>
  </div>
}
export function CloseMapSelection({ onClick }: { onClick: () => void }) {
  return <Button size="compact" variant="quiet" className="min-w-target shrink-0" aria-label="Fechar relato selecionado" onClick={onClick}><Icon name="close" /></Button>
}
