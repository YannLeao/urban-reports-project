import { HealthStatus } from '../features/health/HealthStatus'

export function StatusPage() {
  return (
    <>
      <section className="pt-12 pb-8 md:pt-16" aria-labelledby="page-title">
        <p className="mb-3 text-small font-bold text-brand-default">Alô Cidade</p>
        <h1 id="page-title">Status do serviço</h1>
        <p className="mb-0 text-lead text-text-secondary">Confira se conseguimos nos conectar ao serviço agora.</p>
      </section>
      <HealthStatus />
    </>
  )
}
