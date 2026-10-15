import { OccurrenceStatus } from '../features/occurrence/OccurrenceStatus'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { OccurrenceLocation } from '../features/occurrence/OccurrenceLocation'
import { queryReturn } from '../features/occurrence/map-navigation'
import { Link, useLocation, useParams } from 'react-router'
import { Alert } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { buttonStyles } from '../components/ui/button-styles'
import { PublicRequestError } from '../lib/api'
import { PublicOccurrencePhoto } from '../features/occurrence/PublicOccurrencePhoto'
import { usePublicOccurrence } from '../features/occurrence/usePublicOccurrences'
import { occurrenceDate } from '../features/occurrence/occurrence'

export function PublicOccurrenceDetailPage() {
  const location = useLocation()
  const from = queryReturn(location.state?.from, false)
  const { id } = useParams()
  const query = usePublicOccurrence(id)
  const notFound = query.error instanceof PublicRequestError && query.error.status === 404

  const client = useQueryClient()
  const report = notFound ? undefined : query.data
  useEffect(() => { if (notFound) void client.invalidateQueries({ queryKey: ['public', 'occurrences', 'markers'] }) }, [client, notFound])
  const returnParams = new URLSearchParams(from.split('?')[1])
  if (notFound) returnParams.delete('selecionado')
  const back = notFound ? `/ocorrencias?${returnParams}` : from

  return <section className="py-8" aria-label="Detalhe do relato público">
    <div className="max-w-reading wrap-anywhere">
      <Link className={buttonStyles('quiet')} to={back}>← Relatos</Link>
      {query.isPending && <p className="mt-8" role="status">Carregando relato…</p>}
      {query.isError && <Alert className="mt-6" tone="danger" role="alert">
        {notFound ? 'Este relato não foi encontrado.' : 'Não conseguimos carregar este relato. Tente novamente.'}
      </Alert>}
      {query.isError && !notFound && <Button className="mt-4" variant="secondary" loading={query.isFetching} onClick={() => { void query.refetch() }}>Tentar novamente</Button>}
      {query.isError && <Link className={`${buttonStyles('secondary')} mt-4`} to={back}>Voltar para os relatos</Link>}
      {report && <>
        <div className="mt-8 flex flex-wrap items-start justify-between gap-3"><div><p className="mb-2 text-small font-bold text-brand-default">Relato registrado</p><h1 className="mb-0">{report.title}</h1></div><OccurrenceStatus status={report.status} /></div>
        <PublicOccurrencePhoto key={report.id} report={report} full />
        <Card className="mt-6"><dl className="grid gap-5">
          <div><dt className="font-bold">Categoria</dt><dd className="m-0">{report.categoryName}</dd></div>
          {report.description && <div><dt className="font-bold">Detalhes</dt><dd className="m-0 whitespace-pre-wrap">{report.description}</dd></div>}
          <div><dt className="font-bold">Localização</dt><dd className="m-0">{report.neighborhood} · {report.reference}</dd></div>
          <div><dt className="font-bold">Data do registro</dt><dd className="m-0">{occurrenceDate(report.createdAt)}</dd></div>
        </dl></Card>
        <OccurrenceLocation report={report} />
        <Link className={buttonStyles('quiet')} to={from.includes('visao=mapa') ? from : '/ocorrencias?visao=mapa'}>Ver mapa dos relatos</Link>
      </>}
    </div>
  </section>
}