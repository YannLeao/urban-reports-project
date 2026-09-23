import { Link, NavLink } from 'react-router'
import { AppRoutes } from './app/routes'

function App() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-app flex-col p-6 md:p-8 wrap-anywhere">
      <a className="absolute left-4 top-4 z-10 -translate-y-[200%] bg-surface-raised p-3 focus:translate-y-0" href="#main-content">Pular para o conteúdo</a>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-b-border-subtle pb-6">
        <Link className="inline-flex items-center gap-3 text-lead font-bold text-brand-deep no-underline" to="/" aria-label="Alô Cidade, início">
          <img className="size-target" src="/favicon.svg" alt="" width="44" height="44" />
          <span>Alô Cidade</span>
        </Link>
        <nav aria-label="Navegação principal" className="flex flex-wrap gap-4">
          <NavLink className="inline-flex min-h-target items-center aria-[current=page]:font-bold" to="/" end>Início</NavLink>
          <NavLink className="inline-flex min-h-target items-center aria-[current=page]:font-bold" to="/status">Status</NavLink>
          <NavLink className="inline-flex min-h-target items-center aria-[current=page]:font-bold" to="/minha-conta">Minha conta</NavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-reading flex-1" id="main-content" tabIndex={-1}><AppRoutes /></main>
      <footer className="mt-8 pt-16 text-small text-text-secondary">
        <span>Construindo cidades mais cuidadas, juntos.</span>
      </footer>
    </div>
  )
}

export default App
