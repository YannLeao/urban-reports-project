import { Link } from 'react-router'
import { Alert, StatusBadge } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { buttonStyles } from '../components/ui/button-styles'
import { useOccurrences } from '../features/occurrence/useOccurrences'
import { occurrenceDate, occurrenceStatusLabel } from '../features/occurrence/occurrence'

export function MyReportsPage() {
  const query = useOccurrences()
  const reports = query.data
  const error = query.isError

  return <section className="py-8" aria-labelledby="reports-title">
    <div className="max-w-reading">
      <p className="mb-2 text-small font-bold text-brand-default">Acompanhamento</p>
      <h1 id="reports-title">Meus relatos</h1>
      <p className="text-lead text-text-secondary">Acompanhe o estado atual dos problemas que você registrou.</p>
      {query.isPending && <p role="status" className="mt-8">Carregando seus relatos…</p>}
      {error && <Alert className="mt-6" tone="danger" role="alert">Não conseguimos carregar seus relatos. Tente novamente.</Alert>}
      {error && <Button className="mt-4" variant="secondary" loading={query.isFetching} onClick={() => { void query.refetch() }}>Tentar novamente</Button>}
      {reports?.length === 0 && <Card className="mt-8"><h2 className="mt-0">Você ainda não registrou relatos</h2><p>Quando você enviar um problema, ele aparecerá aqui.</p><Link className={buttonStyles()} to="/registrar-ocorrencia">Registrar problema</Link></Card>}
      {reports && reports.length > 0 && <div className="mt-8 grid gap-4" aria-label="Relatos registrados">
        {reports.map(report => <Card key={report.id}>
          <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="m-0 text-xl">{report.title}</h2><StatusBadge tone="warning" label={occurrenceStatusLabel(report.status)} /></div>
          <dl className="mt-5 grid gap-2"><div><dt className="font-bold">Categoria</dt><dd className="m-0">{report.categoryName}</dd></div><div><dt className="font-bold">Local</dt><dd className="m-0">{report.neighborhood} · {report.reference}</dd></div><div><dt className="font-bold">Registrado em</dt><dd className="m-0">{occurrenceDate(report.createdAt)}</dd></div></dl>
          <Link className={`${buttonStyles('secondary')} mt-5`} to={`/meus-relatos/${report.id}`}>Ver detalhes</Link>
        </Card>)}
      </div>}
    </div>
  </section>
}
