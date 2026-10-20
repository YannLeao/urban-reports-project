import { useEffect, useRef } from 'react'
import { Button } from '../../components/ui/Button'
import { PrivateRequestError } from '../../lib/api'
import { OccurrenceStatus } from './OccurrenceStatus'
import type { SimilarCriteria, SimilarResult } from './similar-occurrences'
import { useSimilarOccurrences } from './useSimilarOccurrences'

/** Presentation and explicit decision are independent of the surrounding form layout. */
export function SimilarOccurrencesReview({ criteria, visible, busy, onReview, onConfirm }: {
  criteria: SimilarCriteria | null; visible: boolean; busy: boolean; onReview: () => void; onConfirm: () => void
}) {
  const query = useSimilarOccurrences(criteria)
  const authError = query.error instanceof PrivateRequestError ? query.error.status : null
  const status = !criteria ? 'not-executed' : query.isFetching ? 'loading' : authError === 403 ? 'forbidden'
    : authError === 401 ? 'unauthorized' : query.isError ? 'unavailable' : query.data?.items.length ? 'candidates' : 'empty'
  return <SimilarOccurrencesPanel status={status} result={query.data} visible={visible} busy={busy}
    onReview={onReview} onConfirm={onConfirm} onRetry={() => { void query.refetch() }} />
}

export function SimilarOccurrencesPanel({ status, result, visible, busy, onReview, onConfirm, onRetry }: {
  status: 'not-executed' | 'loading' | 'forbidden' | 'unauthorized' | 'unavailable' | 'candidates' | 'empty'
  result?: SimilarResult; visible: boolean; busy: boolean
  onReview: () => void; onConfirm: () => void; onRetry: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { if (visible) panel.current?.focus() }, [visible])
  const forbidden = status === 'forbidden' || status === 'unauthorized'
  const loading = status === 'loading'
  return <div hidden={!visible} ref={panel} tabIndex={-1} aria-labelledby="similar-title" className="min-w-0 rounded-card border border-border-default bg-surface-raised p-4">
    <h2 id="similar-title" className="text-title">Antes de confirmar</h2>
    <div role="status" aria-live="polite">
      {status === 'not-executed' ? <p>Consulta geográfica não executada: este relato não tem ponto confirmado.</p>
        : loading ? <p>Consultando relatos próximos…</p>
        : forbidden ? <p>{status === 'forbidden' ? 'Sua conta não tem acesso à consulta de relatos semelhantes.' : 'Sua sessão terminou. Entre novamente.'}</p>
        : status === 'unavailable' ? <p>Não foi possível consultar relatos semelhantes</p>
        : status === 'candidates' ? <p>Encontramos relatos próximos da mesma categoria. Algum deles já representa este problema?</p>
        : <p>Não encontramos relatos semelhantes nesta consulta</p>}
    </div>
    {status === 'candidates' && result && result.items.length > 0 && <>
      <p className="text-small text-text-secondary">Até cinco sugestões a 100 metros. Proximidade não comprova que seja o mesmo problema, inclusive na categoria Outro.</p>
      <ul className="grid min-w-0 gap-3 p-0">{result.items.map(item => <li key={item.id} className="min-w-0 list-none break-words rounded-control border border-border-subtle p-3">
        <p className="font-bold">{item.title}</p><p>{item.categoryName} · aproximadamente {Math.round(item.distanceMeters)} m</p>
        <p>{item.neighborhood} · {item.reference}</p><OccurrenceStatus status={item.status} />
        <a className="underline" href={`/ocorrencias/${item.id}`} target="_blank" rel="noopener noreferrer">Consultar relato (abre em nova aba)</a>
      </li>)}</ul>
    </>}
    <div className="mt-4 flex flex-wrap gap-3">
      <Button type="button" variant="secondary" disabled={busy} onClick={onReview}>Revisar meu relato</Button>
      {status === 'unavailable' && !forbidden && <Button type="button" variant="secondary" disabled={busy || loading} onClick={onRetry}>Consultar novamente</Button>}
      {!forbidden && <Button type="button" disabled={busy || loading} onClick={onConfirm}>
        {status === 'unavailable' ? 'Enviar mesmo assim' : status === 'candidates' ? 'É outro relato, continuar' : 'Confirmar envio'}
      </Button>}
    </div>
  </div>
}
