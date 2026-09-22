import { HealthStatus } from '../features/health/HealthStatus'

export function StatusPage() {
  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Diagnóstico</p>
        <h1 id="page-title">Status da plataforma</h1>
      </section>
      <HealthStatus />
    </>
  )
}
