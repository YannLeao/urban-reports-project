import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { Alert } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useNotifications } from '../features/notification/notifications'

export function NotificationsPage() {
  const [page, setPage] = useState(0)
  const query = useNotifications(page)
  const reading = useRef(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState(false)

  async function read(id: string) {
    if (reading.current) return
    reading.current = true
    setPendingId(id); setError(false)
    try { await query.markRead(id) } catch { setError(true) } finally { reading.current = false; setPendingId(null) }
  }

  return <section className="py-8" aria-labelledby="notifications-title">
    <h1 id="notifications-title">Notificações</h1>
    {query.isPending && <p role="status">Carregando notificações…</p>}
    {query.isError && <Alert tone="danger" role="alert">Não conseguimos atualizar suas notificações. <Button variant="secondary" loading={query.isFetching} onClick={() => { void query.refetch() }}>Tentar novamente</Button></Alert>}
    {error && <Alert className="mt-4" tone="danger" role="alert">Não foi possível marcar a notificação como lida.</Alert>}
    {query.data?.items.length === 0 && <Card className="mt-6"><p className="m-0">Você ainda não tem notificações.</p></Card>}
    <div className="mt-6 grid gap-4" aria-label="Suas notificações">
      {query.data?.items.map(item => <Card key={item.id} className={item.readAt ? '' : 'border-l-4 border-l-feedback-info-foreground'}>
        <p className="m-0">{item.message}</p>
        <p className="mt-2 text-small font-bold">{item.readAt ? 'Lida' : 'Não lida'}</p>
        <Link to={`/meus-relatos/${item.occurrenceId}`}>Ver relato</Link>
        <p className="mt-2 text-small text-text-secondary"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('pt-BR')}</time></p>
        {!item.readAt && <Button variant="secondary" disabled={pendingId !== null && pendingId !== item.id} loading={pendingId === item.id} onClick={() => { void read(item.id) }}>Marcar como lida</Button>}
      </Card>)}
    </div>
    <nav aria-label="Paginação das notificações" className="mt-6 flex flex-wrap items-center gap-3">
      <Button variant="secondary" disabled={page === 0 || query.isFetching} onClick={() => setPage(value => value - 1)}>Anterior</Button>
      <span>Página {page + 1}</span>
      <Button variant="secondary" disabled={!query.data || page + 1 >= query.data.totalPages || query.isFetching} onClick={() => setPage(value => value + 1)}>Próxima</Button>
    </nav>
  </section>
}
