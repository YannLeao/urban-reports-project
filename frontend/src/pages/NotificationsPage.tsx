import { useState } from 'react'
import { Alert } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useNotifications } from '../features/notification/notifications'

export function NotificationsPage() {
  const query = useNotifications()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState(false)

  async function read(id: string) {
    setPendingId(id); setError(false)
    try { await query.markRead(id); await query.refetch() } catch { setError(true) } finally { setPendingId(null) }
  }

  return <section className="py-8" aria-labelledby="notifications-title">
    <h1 id="notifications-title">Notificações</h1>
    {query.isPending && <p role="status">Carregando notificações…</p>}
    {query.isError && <Alert tone="danger" role="alert">Não conseguimos carregar suas notificações.</Alert>}
    {error && <Alert className="mt-4" tone="danger" role="alert">Não foi possível marcar a notificação como lida.</Alert>}
    {query.data?.items.length === 0 && <Card className="mt-6"><p className="m-0">Você ainda não tem notificações.</p></Card>}
    <div className="mt-6 grid gap-4" aria-label="Suas notificações">
      {query.data?.items.map(item => <Card key={item.id} className={item.readAt ? '' : 'border-l-4 border-l-feedback-info-foreground'}>
        <p className="m-0">{item.message}</p>
        <p className="mt-2 text-small text-text-secondary"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('pt-BR')}</time></p>
        {!item.readAt && <Button variant="secondary" loading={pendingId === item.id} onClick={() => { void read(item.id) }}>Marcar como lida</Button>}
      </Card>)}
    </div>
  </section>
}
