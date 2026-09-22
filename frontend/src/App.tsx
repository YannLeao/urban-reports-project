import { Link } from 'react-router'
import { AppRoutes } from './app/routes'
import './App.css'

function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Urban Reports, início">
          <span className="brand-mark" aria-hidden="true">UR</span>
          <span>Urban Reports</span>
        </Link>
        <nav aria-label="Navegação principal" className="flex flex-wrap gap-4">
          <Link to="/">Início</Link>
          <Link to="/status">Status</Link>
        </nav>
      </header>
      <main><AppRoutes /></main>
      <footer className="footer-note">
        <span className="footer-line" aria-hidden="true" />
        <span>Construindo cidades mais cuidadas, juntos.</span>
      </footer>
    </div>
  )
}

export default App
