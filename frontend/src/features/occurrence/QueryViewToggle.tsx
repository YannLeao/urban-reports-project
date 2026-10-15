import { Link, useSearchParams } from 'react-router'
import { buttonStyles } from '../../components/ui/button-styles'

export function QueryViewToggle() {
  const [params] = useSearchParams()
  const map = params.get('visao') === 'mapa'
  const listParams = new URLSearchParams(params); listParams.delete('visao')
  const mapParams = new URLSearchParams(params); mapParams.set('visao', 'mapa')
  return <nav aria-label="Visualização dos relatos" className="flex flex-wrap gap-2">
    <Link className={buttonStyles(map ? 'secondary' : 'primary', '', 'compact')} to={`?${listParams}`} aria-current={!map ? 'page' : undefined}>Lista</Link>
    <Link className={buttonStyles(map ? 'primary' : 'secondary', '', 'compact')} to={`?${mapParams}`} aria-current={map ? 'page' : undefined}>Mapa</Link>
  </nav>
}
