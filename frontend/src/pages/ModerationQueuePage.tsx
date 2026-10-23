import { deniedRead } from '../lib/live-query'
import { OccurrenceFilters } from '../features/occurrence/OccurrenceFilters'
import { parseFilters, filterQuery } from '../features/occurrence/filters'
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
  const filters = parseFilters(params, 'admin').filters
  const filtered = filters.categoryId !== null || filters.status !== null
  const requested = Number(params.get('pagina') ?? '1')
  const page = Number.isInteger(requested) && requested >= 1 ? requested - 1 : 0
  function setPage(value: number) { const next = new URLSearchParams(params); next.set('pagina', String(value + 1)); setParams(next) }
  const query = useAdministrativeQuery('moderation', { page, size: 20, ...filters }, `/api/admin/occurrences?page=${page}&size=20&${filterQuery(filters, true)}`, moderationQueueSchema)
  const data = deniedRead(query.error) ? undefined : query.data
  return <section className="py-8" aria-labelledby="queue-title">
    <h1 id="queue-title">{filters.scope === 'ALL' ? 'Todos os relatos' : 'Fila de moderação'}</h1><p>Relatos dos mais antigos aos mais recentes.</p>
    <OccurrenceFilters context="admin" total={data?.totalItems} />
    {query.isPending && <p role="status">Carregando fila…</p>}
    {query.isError && <Alert tone="danger" role="alert">{data ? 'Não foi possível atualizar. A fila anterior foi mantida.' : 'Não conseguimos carregar a fila.'} <Button onClick={() => { void query.refetch() }}>Tentar novamente</Button></Alert>}
    {data && <>
      {data.items.length === 0 && <div><p>{page > 0 ? 'Nenhum relato nesta página.' : filtered ? 'Nenhum relato com estes filtros.' : filters.scope === 'QUEUE' ? 'A fila de moderação está vazia.' : 'Ainda não há relatos.'}</p>{page > 0 && <Button variant="secondary" onClick={() => setPage(0)}>Voltar para a primeira página</Button>}</div>}
      <div className="grid gap-4">{data.items.map(report => <Card key={report.id} aria-label={report.title} density="compact">
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
        <span>Página {page + 1} de {Math.max(1, data.totalPages)}</span>
        <Button variant="secondary" disabled={page + 1 >= data.totalPages} onClick={() => setPage(page + 1)}>Próxima</Button>
      </nav>
    </>}
  </section>
}
