import { useHealth } from './useHealth'

export function HealthStatus() {
  const { data: health, error, isFetching: isLoading, refetch } = useHealth()
  return (
    <section className="status-panel" aria-labelledby="status-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Diagnóstico</p>
          <h2 id="status-title">Disponibilidade da API</h2>
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
          <p>{error.message}</p>
          <button className="action-button" type="button" onClick={() => void refetch()}>
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
  )
}
