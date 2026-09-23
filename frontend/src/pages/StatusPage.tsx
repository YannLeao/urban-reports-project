import { HealthStatus } from '../features/health/HealthStatus'

export function StatusPage() {
  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Alô Cidade</p>
        <h1 id="page-title">Status do serviço</h1>
        <p className="intro-copy">Confira se conseguimos nos conectar ao serviço agora.</p>
      </section>
      <HealthStatus />
    </>
  )
}
