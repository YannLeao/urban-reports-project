import { useCallback, useEffect, useState } from 'react'
import './App.css'

type HealthResponse = {
  status: string
}

const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, '')

function getApiUrl() {
  if (!apiUrl) {
    throw new Error('VITE_API_URL não foi configurada.')
  }

  if (window.location.protocol === 'https:' && apiUrl.startsWith('http://')) {
    throw new Error('A API de produção deve usar HTTPS.')
  }

  return apiUrl
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const checkApiHealth = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setHealth(null)

    try {
      const response = await fetch(`${getApiUrl()}/api/health`)

      if (response.status !== 200) {
        throw new Error(`A API respondeu com o status HTTP ${response.status}.`)
      }

      setHealth((await response.json()) as HealthResponse)
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? 'Não foi possível conectar à API. Verifique se o backend está disponível.'
          : requestError instanceof Error
            ? requestError.message
            : 'Não foi possível conectar à API.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void checkApiHealth()
  }, [checkApiHealth])

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Urban Reports, início">
          <span className="brand-mark" aria-hidden="true">UR</span>
          <span>Urban Reports</span>
        </a>
        <span className="environment-label">Painel inicial</span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Plataforma de ocorrências urbanas</p>
        <h1 id="page-title">Tudo começa pelo que acontece na sua cidade.</h1>
        <p className="intro-copy">
          Um espaço simples para registrar, acompanhar e dar visibilidade aos
          problemas urbanos.
        </p>
      </section>

      <section className="status-panel" aria-labelledby="status-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Diagnóstico</p>
            <h2 id="status-title">Status da plataforma</h2>
          </div>
          <span className={`status-dot ${isLoading ? 'is-loading' : error ? 'is-error' : 'is-ready'}`} aria-hidden="true" />
        </div>

        {isLoading && (
          <div className="state-content" role="status" aria-live="polite">
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-copy" />
            <span className="state-label">Conectando à API...</span>
          </div>
        )}

        {!isLoading && error && (
          <div className="state-content" role="alert">
            <strong>Não foi possível carregar o status.</strong>
            <p>{error}</p>
            <button className="action-button" type="button" onClick={() => void checkApiHealth()}>
              Tentar novamente
            </button>
          </div>
        )}

        {!isLoading && !error && health && (
          <div className="state-content ready-content" role="status" aria-live="polite">
            <div>
              <strong>API operacional</strong>
              <p>Os serviços essenciais estão respondendo normalmente.</p>
            </div>
            <span className="status-value">{health.status}</span>
          </div>
        )}
      </section>

      <footer className="footer-note">
        <span className="footer-line" aria-hidden="true" />
        <span>Construindo cidades mais cuidadas, juntos.</span>
      </footer>
    </main>
  )
}

export default App
