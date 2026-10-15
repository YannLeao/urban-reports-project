import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Alert, StatusBadge } from '../components/ui/Feedback'
import { buttonStyles } from '../components/ui/button-styles'
import { moderationQueueSchema, useAdministrativeQuery } from '../features/administration/administration'
import { OccurrencePhoto } from '../features/occurrence/OccurrencePhoto'
import { occurrenceDate, occurrenceStatusLabel } from '../features/occurrence/occurrence'

export function ModerationQueuePage() {
  const [page, setPage] = useState(0)
  const query = useAdministrativeQuery('moderation', page, `/api/admin/occurrences?page=${page}&size=20`, moderationQueueSchema)
  return <section className="py-8" aria-labelledby="queue-title">
    <h1 id="queue-title">Fila de moderação</h1><p>Relatos pendentes e em análise, dos mais antigos aos mais recentes.</p>
    {query.isPending && <p role="status">Carregando fila…</p>}
    {query.isError && <Alert tone="danger" role="alert">Não conseguimos carregar a fila. <Button onClick={() => { void query.refetch() }}>Tentar novamente</Button></Alert>}
    {!query.isError && query.data && <>
      {query.data.items.length === 0 && <p>Nenhum relato nesta página da fila.</p>}
      <div className="grid gap-6">{query.data.items.map(report => <Card key={report.id} aria-label={report.title}>
        <OccurrencePhoto report={report} administrative />
        <StatusBadge label={occurrenceStatusLabel(report.status)} /><h2 className="mt-3">{report.title}</h2>
        <p>{report.categoryName}</p><p>{report.neighborhood} · {report.reference}</p><p>{occurrenceDate(report.createdAt)}</p>
        <Link className={buttonStyles()} to={`/administracao/relatos/${report.id}`}>Analisar relato<span className="sr-only">: {report.title}</span></Link>
      </Card>)}</div>
      <nav aria-label="Páginas da fila" className="mt-6 flex flex-wrap items-center gap-4">
        <Button variant="secondary" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Anterior</Button>
        <span>Página {page + 1} de {Math.max(1, query.data.totalPages)}</span>
        <Button variant="secondary" disabled={page + 1 >= query.data.totalPages} onClick={() => setPage(value => value + 1)}>Próxima</Button>
      </nav>
    </>}
  </section>
}
