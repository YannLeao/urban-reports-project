import { useReportPdf } from '../features/administration/report-pdf'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Alert } from '../components/ui/Feedback'
import { CountDistribution } from '../components/ui/CountDistribution'
import { preciseSeconds, resolutionDuration, useOccurrenceReport } from '../features/administration/occurrence-report'
import { occurrenceDate, occurrenceStatusLabel } from '../features/occurrence/occurrence'
import { PrivateRequestError } from '../lib/api'

export function AdministrativeReportPage() {
  const pdf = useReportPdf()
  const query = useOccurrenceReport(!pdf.denied)
  const denied = pdf.denied || (query.error instanceof PrivateRequestError && query.error.status === 403)
  const report = denied ? undefined : query.data
  return <section className="min-w-0 py-8" aria-labelledby="report-title">
    <h1 id="report-title">Relatório administrativo</h1>
    <p>Uma visão dos relatos da comunidade, incluindo rejeitados.</p>
    <div className="flex flex-wrap gap-3">
    <Button aria-disabled={query.isFetching} onClick={() => { if (!query.isFetching) void query.refetch() }}>{query.isError ? 'Tentar novamente' : 'Atualizar relatório'}</Button>
    <Button variant="secondary" aria-busy={pdf.busy} aria-disabled={pdf.busy || denied || query.isPending} onClick={() => { if (!query.isPending && !denied) void pdf.download() }}>{pdf.busy ? 'Gerando PDF…' : 'Baixar PDF'}</Button>
    </div>
    <p className="mt-3 text-small">O PDF consulta os dados atuais; a referência consta no documento.</p>
    {pdf.busy && <p role="status">Gerando PDF…</p>}
    {pdf.error && <Alert tone="danger" role="alert">Não foi possível gerar o PDF. Tente novamente</Alert>}
    {pdf.denied && <Alert tone="danger" role="alert">Acesso negado ao relatório.</Alert>}
    {query.isFetching && <p role="status">Atualizando relatório…</p>}
    {query.isError && <Alert className="my-5" tone="danger" role="alert">{denied ? 'Acesso negado ao relatório.'
      : report ? 'Falha na atualização. Os dados abaixo não foram atualizados; tente novamente.' : 'Não conseguimos carregar o relatório. Tente novamente.'}</Alert>}
    {report && <>
      <p className="mt-4 text-small">Referência da consulta: <time dateTime={report.generatedAt}>{occurrenceDate(report.generatedAt)}</time>. Use atualizar para consultar novas mudanças.</p>
      {report.total === 0 && <p role="status">Nenhum relato disponível. Sem dados para as distribuições.</p>}
      <div className="my-6 grid gap-5 sm:grid-cols-3">
        <Card aria-labelledby="total-title"><h2 id="total-title" className="text-lead">Total de relatos</h2><p className="my-3 text-3xl font-bold wrap-anywhere">{report.total.toLocaleString('pt-BR')}</p></Card>
        <Card aria-labelledby="duration-title"><h2 id="duration-title" className="text-lead">Tempo médio de resolução</h2>
          <p className="my-3 text-3xl font-bold wrap-anywhere">{report.averageResolutionSeconds === null ? 'Sem dados' : resolutionDuration(report.averageResolutionSeconds)}</p>
          <p className="text-small">Da criação à resolução.</p>
          <p className="text-small">{report.resolvedSampleSize} resolvidas na média.</p>
        </Card>
        <Card aria-labelledby="rejected-title"><h2 id="rejected-title" className="text-lead">Proporção de rejeitadas</h2>
          <p className="my-3 text-3xl font-bold wrap-anywhere">{report.rejectedPercentage === null ? 'Sem dados' : `${report.rejectedPercentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</p>
          <p className="text-small">Rejeitadas entre todos os relatos.</p>
        </Card>
      </div>
      <details className="my-5">
        <summary className="min-h-target cursor-pointer py-3 font-bold underline">Como os indicadores são calculados</summary>
        <div className="max-w-reading text-small">
          <p>O total inclui os relatos existentes nos quatro estados, inclusive rejeitados. Relatos excluídos não entram. Não há filtro de período.</p>
          <p>A média vai da criação à resolução, incluindo noites e fins de semana. {report.resolvedSampleSize} consideradas; {report.resolvedWithoutValidDuration} sem duração válida.</p>
          {report.averageResolutionSeconds !== null && <p>Valor em segundos: {preciseSeconds(report.averageResolutionSeconds)}.</p>}
          <p>A proporção divide as rejeitadas pelo total de relatos. Zero é um resultado válido; “Sem dados” indica ausência de relatos ou de durações válidas.</p>
          <p>Nas localidades, grafias, acentos e letras maiúsculas diferentes permanecem separados. Todos os grupos são exibidos.</p>
        </div>
      </details>
      {report.resolvedWithoutValidDuration > 0 && <Alert tone="warning">Média parcial: {report.resolvedSampleSize} resolvidas consideradas e {report.resolvedWithoutValidDuration} excluídas por inconsistência no histórico.</Alert>}
      <div className="my-6 grid gap-5 sm:grid-cols-2">
        <Card aria-labelledby="category-title"><h2 id="category-title">Por categoria</h2><CountDistribution total={report.total} items={report.categories.map(item => ({ key: String(item.categoryId), label: item.categoryName, count: item.count }))} /></Card>
        <Card aria-labelledby="status-title"><h2 id="status-title">Por estado</h2><CountDistribution total={report.total} items={report.statuses.map(item => ({ key: item.status, label: occurrenceStatusLabel(item.status), count: item.count }))} /></Card>
      </div>
      <Card aria-labelledby="locality-title"><h2 id="locality-title">Por bairro/localidade</h2>
        {report.localities.length === 0 ? <p>Sem dados de localidades.</p> : <table className="w-full table-fixed text-left">
          <caption className="sr-only">Contagem de relatos por bairro ou localidade</caption>
          <thead><tr><th scope="col" className="w-2/3 py-3 pr-3">Bairro/localidade</th><th scope="col" className="py-3 text-right">Relatos</th></tr></thead>
          <tbody>{report.localities.map(item => <tr key={JSON.stringify(item.locality)} className="border-t border-border-subtle"><th scope="row" className="break-words py-3 pr-3 font-normal">{item.locality ?? 'Não informado'}</th><td className="py-3 text-right">{item.count.toLocaleString('pt-BR')}</td></tr>)}</tbody>
        </table>}
      </Card>
    </>}
  </section>
}
