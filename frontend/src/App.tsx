import { Link } from 'react-router'
import { AppRoutes } from './app/routes'
import { useAuth } from './features/auth/auth'
import { layoutClasses, useAppLayout } from './app/AppLayout'
import { ProductNavigation } from './app/ProductNavigation'
import { NotificationsAccess } from './app/ProductIntegrations'

function App() {
  const { state } = useAuth()
  const layout = useAppLayout()
  return <div className="mx-auto flex min-h-screen w-full max-w-app flex-col px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pb-6 wrap-anywhere">
    <a className="absolute left-4 top-4 z-50 -translate-y-[200%] rounded-control bg-surface-raised p-3 focus:translate-y-0" href="#main-content">Pular para o conteúdo</a>
    <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border-subtle py-2 md:py-4">
      <Link className="inline-flex min-h-target shrink-0 items-center gap-2 font-bold text-brand-deep no-underline" to="/" aria-label="Alô Cidade, início">
        <img className="size-8" src="/favicon.svg" alt="" width="32" height="32" /><span>Alô Cidade</span>
      </Link>
      <ProductNavigation />
      {state.status === 'authenticated' && state.user.role === 'USER' && <NotificationsAccess />}
    </header>
    <main className={`mx-auto w-full min-w-0 flex-1 ${layoutClasses[layout]}`} id="main-content" tabIndex={-1}><AppRoutes /></main>
    {layout !== 'map' && <footer className="mt-8 py-6 text-small text-text-secondary">A sua comunidade, mais cuidada.</footer>}
  </div>
}

export default App
