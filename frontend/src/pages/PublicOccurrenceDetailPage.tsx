import { Link, useParams } from 'react-router'
import { Alert, StatusBadge } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { buttonStyles } from '../components/ui/button-styles'
import { PublicRequestError } from '../lib/api'
import { PublicOccurrencePhoto } from '../features/occurrence/PublicOccurrencePhoto'
import { usePublicOccurrence } from '../features/occurrence/usePublicOccurrences'
import { occurrenceDate, occurrenceStatusLabel } from '../features/occurrence/occurrence'

export function PublicOccurrenceDetailPage() {
  const { id } = useParams()
  const query = usePublicOccurrence(id)
  const report = query.data
  const notFound = query.error instanceof PublicRequestError && query.error.status === 404

  return <section className="py-8" aria-label="Detalhe da ocorrência">
    <div className="max-w-reading wrap-anywhere">
      <Link className={buttonStyles('quiet')} to="/ocorrencias">← Ocorrências</Link>
      {query.isPending && <p className="mt-8" role="status">Carregando ocorrência…</p>}
      {query.isError && <Alert className="mt-6" tone="danger" role="alert">
        {notFound ? 'Esta ocorrência não foi encontrada.' : 'Não conseguimos carregar esta ocorrência. Tente novamente.'}
      </Alert>}
      {query.isError && !notFound && <Button className="mt-4" variant="secondary" loading={query.isFetching} onClick={() => { void query.refetch() }}>Tentar novamente</Button>}
      {query.isError && <Link className={`${buttonStyles('secondary')} mt-4`} to="/ocorrencias">Voltar para as ocorrências</Link>}
      {report && <>
        <div className="mt-8 flex flex-wrap items-start justify-between gap-3"><div><p className="mb-2 text-small font-bold text-brand-default">Ocorrência registrada</p><h1 className="mb-0">{report.title}</h1></div><StatusBadge tone="info" label={occurrenceStatusLabel(report.status)} /></div>
        <PublicOccurrencePhoto key={report.id} report={report} full />
        <Card className="mt-6"><dl className="grid gap-5">
          <div><dt className="font-bold">Categoria</dt><dd className="m-0">{report.categoryName}</dd></div>
          {report.description && <div><dt className="font-bold">Detalhes</dt><dd className="m-0 whitespace-pre-wrap">{report.description}</dd></div>}
          <div><dt className="font-bold">Localização</dt><dd className="m-0">{report.neighborhood} · {report.reference}</dd></div>
          <div><dt className="font-bold">Data do registro</dt><dd className="m-0">{occurrenceDate(report.createdAt)}</dd></div>
        </dl></Card>
      </>}
    </div>
  </section>
}