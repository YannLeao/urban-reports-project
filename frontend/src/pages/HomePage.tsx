import { Link } from 'react-router'
import { buttonStyles } from '../components/ui/button-styles'
import { Icon } from '../components/ui/Icon'
import { useAuth } from '../features/auth/auth'

export function HomePage() {
  const { state } = useAuth()
  const role = state.status === 'authenticated' ? state.user.role : null
  const panel = role === 'ADMIN' ? '/administracao/relatos' : role === 'SUPER_ADMIN' ? '/administracao/contas' : null
  return <section className="py-8 md:py-12" aria-labelledby="page-title">
    <p className="mb-3 font-bold text-text-secondary">Belo Jardim, Pernambuco</p>
    <h1 id="page-title">Sua rua merece cuidado.</h1>
    <p className="max-w-reading text-lead text-text-secondary">Viu um problema? Mostre onde está.</p>
    <div className="my-6 flex items-center gap-4 rounded-card bg-surface-soft p-6" aria-hidden="true">
      <img src="/favicon.svg" alt="" width="64" height="64" className="size-16" />
      <span className="text-title font-bold">Tá na Rua<br /><span className="text-base font-medium">Sua comunidade no mapa.</span></span>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Link className={buttonStyles(panel ? 'secondary' : 'primary')} to="/ocorrencias?visao=mapa"><Icon name="map" />Ver no mapa</Link>
      {panel ? <Link className={buttonStyles()} to={panel}><Icon name="list" />{role === 'ADMIN' ? 'Abrir moderação' : 'Gerenciar administradores'}</Link>
        : <Link className={buttonStyles('secondary')} to="/registrar-ocorrencia"><Icon name="plus" />Relatar problema</Link>}
    </div>
  </section>
}
