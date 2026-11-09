import { useEffect, useRef } from 'react'
import { Button } from '../../components/ui/Button'
import { PrivateRequestError } from '../../lib/api'
import type { SimilarCriteria, SimilarResult } from './similar-occurrences'
import { useSimilarOccurrences } from './useSimilarOccurrences'

/** Presentation and explicit decision are independent of the surrounding form layout. */
export function SimilarOccurrencesReview({ criteria, visible, busy, onReview, onConfirm, editing = false, wizard = false }: {
  criteria: SimilarCriteria | null; visible: boolean; busy: boolean; onReview: () => void; onConfirm: () => void; editing?: boolean; wizard?: boolean
}) {
  const query = useSimilarOccurrences(criteria, visible)
  const { data, isError, refetch } = query
  const wasVisible = useRef(false)
  useEffect(() => {
    if (visible && !wasVisible.current && criteria && (data || isError)) void refetch()
    wasVisible.current = visible
  }, [criteria, data, isError, refetch, visible])
  const authError = query.error instanceof PrivateRequestError ? query.error.status : null
  const status = !criteria ? 'not-executed' : query.isFetching || query.isPending ? 'loading' : authError === 403 ? 'forbidden'
    : authError === 401 ? 'unauthorized' : isError ? 'unavailable' : data?.hasSimilar ? 'candidates' : 'empty'
  return <SimilarOccurrencesPanel status={status} result={data} visible={visible} busy={busy}
    onReview={onReview} onConfirm={onConfirm} editing={editing} wizard={wizard} />
}

export function SimilarOccurrencesPanel({ status, result, visible, busy, onReview, onConfirm, editing = false, wizard = false }: {
  status: 'not-executed' | 'loading' | 'forbidden' | 'unauthorized' | 'unavailable' | 'candidates' | 'empty'
  result?: SimilarResult; visible: boolean; busy: boolean
  onReview: () => void; onConfirm: () => void; editing?: boolean; wizard?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { if (visible && !wizard) panel.current?.focus() }, [visible, wizard])
  const forbidden = status === 'forbidden' || status === 'unauthorized'
  const loading = status === 'loading'
  return <div hidden={!visible} ref={panel} tabIndex={-1} aria-labelledby="similar-title" className="min-w-0 rounded-card border border-border-default bg-surface-raised p-4">
    <h2 id="similar-title" className="text-title">Antes de confirmar</h2>
    <div role="status" aria-live="polite">
      {status === 'not-executed' ? <p>Consulta geográfica não executada: este relato não tem ponto confirmado.</p>
        : loading ? <p>Consultando relatos próximos…</p>
        : forbidden ? <p>{status === 'forbidden' ? 'Sua conta não tem acesso à consulta de relatos semelhantes.' : 'Sua sessão terminou. Entre novamente.'}</p>
        : status === 'unavailable' ? <p>Não foi possível consultar relatos semelhantes</p>
        : status === 'candidates' ? <p>Encontramos relatos próximos da mesma categoria.</p>
        : <p>Não encontramos relatos semelhantes nesta consulta</p>}
    </div>
    {status === 'candidates' && result?.hasSimilar &&
      <p className="text-small text-text-secondary">Há relatos próximos da mesma categoria. Por privacidade, os detalhes dos relatos não são exibidos aqui.</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      <Button type="button" variant="secondary" disabled={busy} onClick={onReview}>Revisar meu relato</Button>
      {!forbidden && <Button type="button" disabled={busy || loading} onClick={onConfirm}>
        {wizard ? (status === 'unavailable' ? editing ? 'Salvar mesmo assim' : 'Enviar mesmo assim' : status === 'candidates' ? editing ? 'Salvar' : 'Enviar' : editing ? 'Salvar' : 'Enviar') : status === 'unavailable' ? 'Enviar mesmo assim' : status === 'candidates' ? 'É outro relato, continuar' : 'Confirmar envio'}
      </Button>}
    </div>
  </div>
}
