import { Link, useParams } from 'react-router'
import { Alert, StatusBadge } from '../components/ui/Feedback'
import { Card } from '../components/ui/Card'
import { buttonStyles } from '../components/ui/button-styles'
import { useOccurrence } from '../features/occurrence/useOccurrences'
import { Button } from '../components/ui/Button'
import { occurrenceDate, occurrenceStatusLabel } from '../features/occurrence/occurrence'

export function OccurrenceDetailPage() {
  const { id } = useParams()
  const query = useOccurrence(id)
  const report = query.data
  const loading = query.isPending
  const error = query.isError

  return <section className="py-8" aria-label="Detalhe do relato">
    <div className="max-w-reading">
      <Link className={buttonStyles('quiet')} to="/meus-relatos">← Meus relatos</Link>
      {loading && <p className="mt-8" role="status">Carregando relato…</p>}
      {error && <Alert className="mt-6" tone="danger" role="alert">Não conseguimos carregar este relato. Ele pode não existir ou não pertencer à sua conta.</Alert>}
      {error && <Button className="mt-4" variant="secondary" loading={query.isFetching} onClick={() => { void query.refetch() }}>Tentar novamente</Button>}
      {error && <Link className={`${buttonStyles('secondary')} mt-4`} to="/meus-relatos">Voltar para meus relatos</Link>}
      {report && <>
        <div className="mt-8 flex flex-wrap items-start justify-between gap-3"><div><p className="mb-2 text-small font-bold text-brand-default">Relato registrado</p><h1 id="detail-title" className="mb-0">{report.title}</h1></div><StatusBadge tone="warning" label={occurrenceStatusLabel(report.status)} /></div>
        <Card className="mt-6"><dl className="grid gap-5"><div><dt className="font-bold">Categoria</dt><dd className="m-0">{report.categoryName}</dd></div><div><dt className="font-bold">Descrição</dt><dd className="m-0 whitespace-pre-wrap">{report.description}</dd></div><div><dt className="font-bold">Localização</dt><dd className="m-0">{report.neighborhood} · {report.reference}</dd></div><div><dt className="font-bold">Data do registro</dt><dd className="m-0">{occurrenceDate(report.createdAt)}</dd></div></dl></Card>
      </>}
    </div>
  </section>
}
