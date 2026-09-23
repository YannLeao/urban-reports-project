import { Link, NavLink } from 'react-router'
import { AppRoutes } from './app/routes'
import './App.css'

function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Alô Cidade, início">
          <img src="/favicon.svg" alt="" width="44" height="44" />
          <span>Alô Cidade</span>
        </Link>
        <nav aria-label="Navegação principal" className="flex flex-wrap gap-4">
          <NavLink to="/" end>Início</NavLink>
          <NavLink to="/status">Status</NavLink>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}><AppRoutes /></main>
      <footer className="footer-note">
        <span>Construindo cidades mais cuidadas, juntos.</span>
      </footer>
    </div>
  )
}

export default App
