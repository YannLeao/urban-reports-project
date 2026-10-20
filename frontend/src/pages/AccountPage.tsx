import { useAuth } from '../features/auth/auth'
import { LogoutActions } from '../features/auth/LogoutActions'
import { Link } from 'react-router'
import { buttonStyles } from '../components/ui/button-styles'

export function AccountPage() {
  const auth = useAuth()
  if (auth.state.status !== 'authenticated') return null
  return <section className="min-w-0 py-8" aria-labelledby="account-title">
    <h1 id="account-title">Minha conta</h1>
    <dl className="grid min-w-0 gap-2 wrap-anywhere"><dt className="font-bold">Nome</dt><dd className="m-0 min-w-0">{auth.state.user.name}</dd>
      <dt className="font-bold">E-mail</dt><dd className="m-0 min-w-0">{auth.state.user.email}</dd></dl>
    <div className="mt-6">
      <LogoutActions>
        {auth.state.user.role === 'USER' && <Link className={buttonStyles('secondary', 'w-full sm:w-auto')} to="/notificacoes">Notificações</Link>}
        {auth.state.user.role === 'USER' && <><Link className={buttonStyles('primary', 'w-full sm:w-auto')} to="/registrar-ocorrencia">Registrar problema</Link>
        <Link className={buttonStyles('secondary', 'w-full sm:w-auto')} to="/meus-relatos">Meus relatos</Link></>}
        {auth.state.user.role === 'ADMIN' && <Link className={buttonStyles('primary', 'w-full sm:w-auto')} to="/administracao/relatos">Moderar relatos</Link>}
      </LogoutActions>
    </div>
  </section>
}
