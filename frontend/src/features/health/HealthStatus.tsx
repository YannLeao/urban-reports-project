import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Alert, StatusBadge } from '../../components/ui/Feedback'
import { useHealth } from './useHealth'

export function HealthStatus() {
  const { data: health, error, isFetching: isLoading, refetch } = useHealth()
  return (
    <Card className="status-panel" aria-labelledby="status-title">
      <h2 id="status-title">Conexão com o serviço</h2>
      {isLoading && <div className="state-content" role="status">
        <StatusBadge tone="info" label="Verificando" />
        <p>Verificando a conexão…</p>
      </div>}
      {!isLoading && error && <div className="state-content">
        <Alert tone="warning" role="alert">
          <h3>Não foi possível verificar a conexão</h3>
          <p>{error.message}</p>
        </Alert>
        <p>Isso não confirma uma indisponibilidade geral. Você pode tentar de novo.</p>
        <Button onClick={() => void refetch()}>Tentar novamente</Button>
      </div>}
      {!isLoading && !error && health && <div className="state-content" role="status">
        <StatusBadge tone="success" label="Conexão confirmada" />
        <p>O serviço respondeu à verificação. Esta consulta confirma apenas a conexão neste momento.</p>
      </div>}
    </Card>
  )
}
