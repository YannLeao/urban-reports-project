import { Link, useParams } from 'react-router'
import { useOccurrence } from '../features/occurrence/useOccurrences'
import { ReportOccurrencePage } from './ReportOccurrencePage'
export function EditOccurrencePage() {
  const { id } = useParams()
  const query = useOccurrence(id)
  if (query.isPending) return <p role="status">Carregando relato…</p>
  if (!query.data || query.isError) return <p role="alert">Não foi possível carregar o relato. <Link to="/meus-relatos">Meus relatos</Link></p>
  return <ReportOccurrencePage key={query.data.id} existing={query.data} />
}
