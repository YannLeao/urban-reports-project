import { Link } from 'react-router'
import { Icon } from '../components/ui/Icon'
import { useNotifications } from '../features/notification/notifications'

export function PasswordRecoveryAccess() {
  return <p className="mb-0 text-small text-text-secondary">Recuperação de senha em breve</p>
}

export function NotificationsAccess() {
  const query = useNotifications()
  return <NotificationBell unreadCount={query.data?.unreadCount} />
}

export function NotificationBell({ unreadCount: count }: { unreadCount?: number }) {
  return <Link to="/notificacoes" aria-label={count === undefined ? 'Notificações' : `Notificações: ${count} não lidas`}
    className="relative inline-flex min-h-target min-w-target items-center justify-center rounded-pill border border-border-subtle text-text-secondary no-underline">
    <Icon name="bell" />
    {count !== undefined && count > 0 && <span aria-hidden="true" className="absolute -right-2 -top-1 rounded-pill bg-brand-accent px-2 text-small font-bold text-text-primary">{count > 99 ? '99+' : count}</span>}
  </Link>
}
