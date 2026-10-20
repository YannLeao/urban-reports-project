import { useLocation } from 'react-router'

// Shared shell compositions; page content retains its own semantics and controls.
export function useAppLayout() {
  const { pathname, search } = useLocation()
  if ((pathname === '/ocorrencias' || pathname === '/meus-relatos') && new URLSearchParams(search).get('visao') === 'mapa') return 'map'
  if (pathname.startsWith('/administracao/')) return 'panel'
  if (pathname === '/minha-conta') return 'account'
  return 'reading'
}

export const layoutClasses = {
  reading: 'max-w-reading',
  map: 'max-w-app',
  panel: 'max-w-app',
  account: 'max-w-app',
} as const
