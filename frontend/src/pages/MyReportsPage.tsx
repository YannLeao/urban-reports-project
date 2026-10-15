import { OwnMapView } from '../features/occurrence/OccurrenceMapView'
import { QueryViewToggle } from '../features/occurrence/QueryViewToggle'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../features/auth/auth'
import { OccurrencePhoto } from '../features/occurrence/OccurrencePhoto'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Alert, StatusBadge } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { buttonStyles } from '../components/ui/button-styles'
import { useOccurrences } from '../features/occurrence/useOccurrences'
import { occurrenceDate, occurrenceStatusLabel } from '../features/occurrence/occurrence'

export function MyReportsPage() {
  const [params] = useSearchParams()
  const mapMode = params.get('visao') === 'mapa'
  const query = useOccurrences(!mapMode)
  const location = useLocation()
  const client = useQueryClient()
  const { state } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : null
  const deletedId: unknown = location.state?.deletedId
  useEffect(() => {
    if (typeof deletedId === 'string' && userId) client.removeQueries({ queryKey: ['private', userId, 'occurrences', deletedId], exact: true })
  }, [client, userId, deletedId])
  const reports = query.data
  const error = query.isError

  return <section className={mapMode ? 'py-3' : 'py-8'} aria-labelledby="reports-title">
    <div className={mapMode ? 'wrap-anywhere' : 'max-w-reading wrap-anywhere'}>

      <div className="flex flex-wrap items-center justify-between gap-2"><h1 id="reports-title" className={mapMode ? 'mb-0 text-title' : ''}>Meus relatos</h1><QueryViewToggle /></div>
      {!mapMode && <Link className={buttonStyles()} to="/registrar-ocorrencia">Relatar problema</Link>}
      {location.state?.deleted && <Alert>Relato excluído.</Alert>}
      {mapMode ? <OwnMapView /> : <>
      {query.isPending && <p role="status" className="mt-8">Carregando seus relatos…</p>}
      {error && <Alert className="mt-6" tone="danger" role="alert">Não conseguimos carregar seus relatos. Tente novamente.</Alert>}
      {error && <Button className="mt-4" variant="secondary" loading={query.isFetching} onClick={() => { void query.refetch() }}>Tentar novamente</Button>}
      {reports?.length === 0 && <Card className="mt-8"><h2 className="mt-0">Você ainda não registrou relatos</h2><p>Quando você enviar um problema, ele aparecerá aqui.</p><Link className={buttonStyles()} to="/registrar-ocorrencia">Registrar problema</Link></Card>}
      {reports && reports.length > 0 && <div className="mt-8 grid gap-4" aria-label="Relatos registrados">
        {reports.map(report => <Card key={report.id}>
          <OccurrencePhoto report={report} />
          <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="m-0 text-xl">{report.title}</h2><StatusBadge tone="info" label={occurrenceStatusLabel(report.status)} /></div>
          <p className="mb-1">{report.neighborhood} · {report.reference}</p>
          <p className="text-small text-text-secondary">{report.categoryName} · {occurrenceDate(report.createdAt)}</p>
          <Link className={`${buttonStyles('secondary')} mt-5`} to={`/meus-relatos/${report.id}`} state={{ from: `${location.pathname}${location.search}` }} aria-label={`Abrir relato: ${report.title}`}>Ver detalhes</Link>
        </Card>)}
      </div>}
      </>}
    </div>
  </section>
}
