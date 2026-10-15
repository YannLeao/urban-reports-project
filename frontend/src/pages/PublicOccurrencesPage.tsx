import { PublicMapView } from '../features/occurrence/OccurrenceMapView'
import { QueryViewToggle } from '../features/occurrence/QueryViewToggle'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Alert, StatusBadge } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { buttonStyles } from '../components/ui/button-styles'
import { PublicOccurrencePhoto } from '../features/occurrence/PublicOccurrencePhoto'
import { usePublicOccurrences } from '../features/occurrence/usePublicOccurrences'
import { occurrenceDate, occurrenceStatusLabel } from '../features/occurrence/occurrence'

export function PublicOccurrencesPage() {
  const location = useLocation()
  const [params] = useSearchParams()
  const requested = Number(params.get('pagina') ?? '1')
  const page = Number.isInteger(requested) && requested >= 1 ? requested - 1 : 0
  const mapMode = params.get('visao') === 'mapa'
  const query = usePublicOccurrences(page, !mapMode)
  const data = query.data
  const error = query.isError
  function pageLink(value: number) {
    const next = new URLSearchParams(params); next.set('pagina', String(value)); return `/ocorrencias?${next}`
  }

  return <section className="py-8" aria-labelledby="public-title">
    <div className="max-w-reading wrap-anywhere">
      <h1 id="public-title">Ocorrências</h1>
      <p className="text-lead text-text-secondary">Problemas urbanos relatados pela comunidade.</p>
      <QueryViewToggle />
      {mapMode ? <PublicMapView /> : <>
      {query.isPending && <p role="status" className="mt-8">Carregando ocorrências…</p>}
      {error && <Alert className="mt-6" tone="danger" role="alert">Não conseguimos carregar as ocorrências. Tente novamente.</Alert>}
      {error && <Button className="mt-4" variant="secondary" loading={query.isFetching} onClick={() => { void query.refetch() }}>Tentar novamente</Button>}
      {data && data.items.length === 0 && (page === 0
        ? <Card className="mt-8"><h2 className="mt-0">Ainda não há ocorrências públicas</h2><p>Quando houver relatos registrados, eles aparecerão aqui.</p></Card>
        : <Card className="mt-8"><h2 className="mt-0">Esta página não existe</h2><Link className={buttonStyles('secondary')} to="/ocorrencias">Voltar para a primeira página</Link></Card>)}
      {data && data.items.length > 0 && <div className="mt-8 grid gap-4" aria-label="Ocorrências públicas" aria-busy={query.isPlaceholderData}>
        {data.items.map(report => <Card key={report.id}>
          <PublicOccurrencePhoto report={report} />
          <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="m-0 text-xl">{report.title}</h2><StatusBadge tone="info" label={occurrenceStatusLabel(report.status)} /></div>
          <p className="mb-1">{report.neighborhood} · {report.reference}</p>
          <p className="text-small text-text-secondary">{report.categoryName} · {occurrenceDate(report.createdAt)}</p>
          <Link className={`${buttonStyles('secondary')} mt-5`} to={`/ocorrencias/${report.id}`} state={{ from: `${location.pathname}${location.search}` }} aria-label={`Abrir ocorrência: ${report.title}`}>Ver detalhes</Link>
        </Card>)}
      </div>}
      {data && data.totalPages > 1 && <nav className="mt-8 flex flex-wrap items-center gap-3" aria-label="Paginação">
        {page > 0 && <Link className={buttonStyles('secondary')} to={pageLink(page)}>Página anterior</Link>}
        <span>Página {page + 1} de {data.totalPages}</span>
        {page + 1 < data.totalPages && <Link className={buttonStyles('secondary')} to={pageLink(page + 2)}>Próxima página</Link>}
      </nav>}
      </>}
    </div>
  </section>
}