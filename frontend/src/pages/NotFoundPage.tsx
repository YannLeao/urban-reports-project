import { buttonStyles } from '../components/ui/button-styles'
import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="pt-12 pb-8 md:pt-16" aria-labelledby="page-title">
      <p className="mb-3 text-small font-bold text-brand-default">404</p>
      <h1 id="page-title">Página não encontrada</h1>
      <p className="mb-0 text-lead text-text-secondary">O endereço solicitado não está disponível.</p>
      <div className="mt-6 flex flex-wrap gap-4">
        <Link className={buttonStyles()} to="/">Voltar ao início</Link>
      </div>
    </section>
  )
}
