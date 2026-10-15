import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth, safeReturnPath, type User } from './auth'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Feedback'

export function AuthUnavailable() {
  const auth = useAuth()
  return <Alert tone="warning">Não foi possível validar sua sessão. Confira sua conexão.
    <Button className="mt-4" onClick={auth.retry}>Tentar novamente</Button>
  </Alert>
}
export function PrivateRoute() {
  const { state } = useAuth()
  const location = useLocation()
  if (state.status === 'initializing') return <p role="status">Validando sessão…</p>
  if (state.status === 'unavailable') return <AuthUnavailable />
  if (state.status === 'anonymous') return <Navigate to="/entrar" replace state={{ returnTo: safeReturnPath(location.pathname) }} />
  return <Outlet />
}

export function RoleRoute({ role }: { role: User['role'] }) {
  const { state } = useAuth()
  return state.status === 'authenticated' && state.user.role === role ? <Outlet />
    : <section className="py-8"><h1>Acesso restrito</h1><p>Sua conta não tem permissão para acessar esta área.</p></section>
}
