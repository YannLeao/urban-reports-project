import { NavLink } from 'react-router'
import { useAuth } from '../features/auth/auth'
import { Icon, type IconName } from '../components/ui/Icon'

type Destination = { to: string; label: string; icon: IconName }
export function ProductNavigation() {
  const { state } = useAuth()
  const role = state.status === 'authenticated' ? state.user.role : null
  const destinations: Destination[] = role === 'SUPER_ADMIN' ? [
    { to: '/administracao/contas', label: 'Administradores', icon: 'user' },
    { to: '/minha-conta', label: 'Conta', icon: 'user' },
  ] : role === 'ADMIN' ? [
    { to: '/administracao/relatos', label: 'Fila', icon: 'list' },
    { to: '/administracao/relatorio', label: 'Relatório', icon: 'chart' },
    { to: '/minha-conta', label: 'Conta', icon: 'user' },
  ] : [
    { to: '/ocorrencias?visao=mapa', label: 'Mapa', icon: 'map' },
    { to: '/registrar-ocorrencia', label: 'Relatar', icon: 'plus' },
    ...(role === 'USER' ? [
      { to: '/meus-relatos', label: 'Meus relatos', icon: 'list' } as Destination,
      { to: '/minha-conta', label: 'Conta', icon: 'user' } as Destination,
    ] : [{ to: '/entrar', label: 'Entrar', icon: 'user' } as Destination]),
  ]
  return <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-surface-raised pb-[env(safe-area-inset-bottom)] md:static md:border-0 md:bg-transparent md:pb-0">
    <ul className="m-0 flex list-none items-stretch justify-around gap-1 px-2 py-2 md:justify-end md:p-0">
      {destinations.map(item => <li key={item.to} className="min-w-0 flex-1 md:flex-none">
        <NavLink to={item.to} className={({ isActive }) => `flex min-h-target flex-col items-center justify-center gap-1 rounded-control px-2 py-2 text-center text-small font-bold no-underline md:flex-row md:gap-2 md:px-3 ${isActive ? 'bg-brand-accent text-text-primary' : 'text-text-secondary hover:bg-surface-soft'}`}>
          <Icon name={item.icon} /><span>{item.label}</span>
        </NavLink>
      </li>)}
    </ul>
  </nav>
}
