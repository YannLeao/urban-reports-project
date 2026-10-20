import { OccurrenceFilters } from '../features/occurrence/OccurrenceFilters'
import { parseFilters } from '../features/occurrence/filters'
import { OccurrenceStatus } from '../features/occurrence/OccurrenceStatus'
import { OwnMapView } from '../features/occurrence/OccurrenceMapView'
import { QueryViewToggle } from '../features/occurrence/QueryViewToggle'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../features/auth/auth'
import { OccurrencePhoto } from '../features/occurrence/OccurrencePhoto'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Alert } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { buttonStyles } from '../components/ui/button-styles'
import { useOccurrences } from '../features/occurrence/useOccurrences'

export function MyReportsPage() {
  const [params] = useSearchParams()
  const filters = parseFilters(params, 'own').filters
  const filtered = filters.categoryId !== null || filters.status !== null
  const mapMode = params.get('visao') === 'mapa'
  const query = useOccurrences(!mapMode, filters)
  const location = useLocation()
  const client = useQueryClient()
  const { state } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : null
  const deletedId: unknown = location.state?.deletedId
  useEffect(() => {
    if (typeof deletedId === 'string' && userId) client.removeQueries({ queryKey: ['private', userId, 'occurrences', 'detail', deletedId], exact: true })
  }, [client, userId, deletedId])
  const reports = query.data
  const error = query.isError

  return <section className={mapMode ? 'py-3' : 'py-8'} aria-labelledby="reports-title">
    <div className={mapMode ? 'wrap-anywhere' : 'max-w-reading wrap-anywhere'}>

      <div className="flex flex-wrap items-center justify-between gap-2"><h1 id="reports-title" className={mapMode ? 'mb-0 text-title' : ''}>Meus relatos</h1></div>
      {!mapMode && <Link className={buttonStyles()} to="/registrar-ocorrencia">Relatar problema</Link>}
      {location.state?.deleted && <Alert>Relato excluído.</Alert>}
      <OccurrenceFilters context="own" total={!mapMode ? reports?.length : undefined} />
      <div className="flex justify-end"><QueryViewToggle /></div>
      {mapMode ? <OwnMapView /> : <>
      {query.isPending && <p role="status" className="mt-8">Carregando seus relatos…</p>}
      {error && <Alert className="mt-6" tone="danger" role="alert">Não conseguimos carregar seus relatos. Tente novamente.</Alert>}
      {error && <Button className="mt-4" variant="secondary" loading={query.isFetching} onClick={() => { void query.refetch() }}>Tentar novamente</Button>}
      {reports?.length === 0 && <Card className="mt-8"><h2 className="mt-0">{filtered ? 'Nenhum relato com estes filtros' : 'Você ainda não registrou relatos'}</h2><p>{filtered ? 'Ajuste os filtros ou limpe a seleção para consultar outros relatos.' : 'Quando você enviar um problema, ele aparecerá aqui.'}</p><Link className={buttonStyles()} to="/registrar-ocorrencia">Registrar problema</Link></Card>}
      {reports && reports.length > 0 && <div className="mt-8 grid gap-4" aria-label="Relatos registrados">
        {reports.map(report => <article key={report.id} className="min-w-0 rounded-card border border-border-subtle bg-surface-raised shadow-card">
          <OccurrencePhoto report={report} flush />
          <div className="grid min-w-0 gap-3 p-4 sm:p-5">
            <h2 className="m-0 text-title"><Link className="flex min-h-target items-center" to={`/meus-relatos/${report.id}`} state={{ from: `${location.pathname}${location.search}` }}>{report.title}</Link></h2>
            <div><OccurrenceStatus status={report.status} /></div>
            <p className="m-0">{report.neighborhood}</p>
            <p className="m-0 text-small text-text-secondary">{report.categoryName} · <time dateTime={report.createdAt}>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(report.createdAt))}</time></p>
          </div>
        </article>)}
      </div>}
      </>}
    </div>
  </section>
}
