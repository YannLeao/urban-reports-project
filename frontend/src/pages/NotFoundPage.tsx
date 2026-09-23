import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="intro" aria-labelledby="page-title">
      <p className="eyebrow">404</p>
      <h1 id="page-title">Página não encontrada</h1>
      <p className="intro-copy">O endereço solicitado não está disponível.</p>
      <div className="mt-6 flex flex-wrap gap-4">
        <Link className="button button-primary" to="/">Voltar ao início</Link>
      </div>
    </section>
  )
}
