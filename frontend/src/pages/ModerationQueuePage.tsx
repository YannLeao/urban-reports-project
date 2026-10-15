import { OccurrenceStatus } from '../features/occurrence/OccurrenceStatus'
import { Link, useSearchParams } from 'react-router'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Alert } from '../components/ui/Feedback'
import { buttonStyles } from '../components/ui/button-styles'
import { moderationQueueSchema, useAdministrativeQuery } from '../features/administration/administration'
import { OccurrencePhoto } from '../features/occurrence/OccurrencePhoto'
import { occurrenceDate } from '../features/occurrence/occurrence'

export function ModerationQueuePage() {
  const [params, setParams] = useSearchParams()
  const requested = Number(params.get('pagina') ?? '1')
  const page = Number.isInteger(requested) && requested >= 1 ? requested - 1 : 0
  function setPage(next: number) { setParams({ pagina: String(next + 1) }) }
  const query = useAdministrativeQuery('moderation', page, `/api/admin/occurrences?page=${page}&size=20`, moderationQueueSchema)
  return <section className="py-8" aria-labelledby="queue-title">
    <h1 id="queue-title">Fila de moderação</h1><p>Relatos pendentes e em análise, dos mais antigos aos mais recentes.</p>
    {query.isPending && <p role="status">Carregando fila…</p>}
    {query.isError && <Alert tone="danger" role="alert">Não conseguimos carregar a fila. <Button onClick={() => { void query.refetch() }}>Tentar novamente</Button></Alert>}
    {!query.isError && query.data && <>
      {query.data.items.length === 0 && <p>Nenhum relato nesta página da fila.</p>}
      <div className="grid gap-4">{query.data.items.map(report => <Card key={report.id} aria-label={report.title} density="compact">
        <div className="grid min-w-0 gap-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center">
        <div className="w-24 sm:w-full"><OccurrencePhoto report={report} administrative flush /></div>
        <div className="min-w-0 wrap-anywhere">
        <OccurrenceStatus status={report.status} /><h2 className="my-2 text-title">{report.title}</h2>
        <p className="mb-1">{report.neighborhood}</p><p className="mb-0 text-small text-text-secondary">{report.categoryName} · {occurrenceDate(report.createdAt)}</p>
        </div>
        <Link aria-label={`Analisar relato: ${report.title}`} className={buttonStyles()} to={`/administracao/relatos/${report.id}`} state={{ from: `/administracao/relatos${params.size ? `?${params}` : ''}` }}>Analisar relato</Link>
        </div>
      </Card>)}</div>
      <nav aria-label="Páginas da fila" className="mt-6 flex flex-wrap items-center gap-4">
        <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
        <span>Página {page + 1} de {Math.max(1, query.data.totalPages)}</span>
        <Button variant="secondary" disabled={page + 1 >= query.data.totalPages} onClick={() => setPage(page + 1)}>Próxima</Button>
      </nav>
    </>}
  </section>
}
