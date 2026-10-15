import { OccurrenceStatus } from '../features/occurrence/OccurrenceStatus'
import { PublicMapView } from '../features/occurrence/OccurrenceMapView'
import { QueryViewToggle } from '../features/occurrence/QueryViewToggle'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Alert } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { buttonStyles } from '../components/ui/button-styles'
import { PublicOccurrencePhoto } from '../features/occurrence/PublicOccurrencePhoto'
import { usePublicOccurrences } from '../features/occurrence/usePublicOccurrences'

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

  return <section className={mapMode ? 'py-3' : 'py-8'} aria-labelledby="public-title">
    <div className={mapMode ? 'wrap-anywhere' : 'max-w-reading wrap-anywhere'}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 id="public-title" className={mapMode ? 'mb-0 text-title' : ''}>Relatos da comunidade</h1><QueryViewToggle /></div>
      {!mapMode && <p className="text-lead text-text-secondary">Problemas urbanos relatados pela comunidade.</p>}
      {mapMode ? <PublicMapView /> : <>
      {query.isPending && <p role="status" className="mt-8">Carregando relatos…</p>}
      {error && <Alert className="mt-6" tone="danger" role="alert">Não conseguimos carregar os relatos. Tente novamente.</Alert>}
      {error && <Button className="mt-4" variant="secondary" loading={query.isFetching} onClick={() => { void query.refetch() }}>Tentar novamente</Button>}
      {data && data.items.length === 0 && (page === 0
        ? <Card className="mt-8"><h2 className="mt-0">Ainda não há relatos públicos</h2><p>Quando houver relatos registrados, eles aparecerão aqui.</p></Card>
        : <Card className="mt-8"><h2 className="mt-0">Esta página não existe</h2><Link className={buttonStyles('secondary')} to="/ocorrencias">Voltar para a primeira página</Link></Card>)}
      {data && data.items.length > 0 && <div className="mt-8 grid gap-4" aria-label="Relatos da comunidade" aria-busy={query.isPlaceholderData}>
        {data.items.map(report => <article key={report.id} className="min-w-0 rounded-card border border-border-subtle bg-surface-raised shadow-card">
          <PublicOccurrencePhoto report={report} flush />
          <div className="grid min-w-0 gap-3 p-4 sm:p-5">
            <h2 className="m-0 text-title"><Link className="flex min-h-target items-center" to={`/ocorrencias/${report.id}`} state={{ from: `${location.pathname}${location.search}` }}>{report.title}</Link></h2>
            <div><OccurrenceStatus status={report.status} /></div>
            <p className="m-0">{report.neighborhood}</p>
            <p className="m-0 text-small text-text-secondary">{report.categoryName} · <time dateTime={report.createdAt}>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(report.createdAt))}</time></p>
          </div>
        </article>)}
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