import { Link, useSearchParams } from 'react-router'
import { buttonStyles } from '../../components/ui/button-styles'

export function QueryViewToggle() {
  const [params] = useSearchParams()
  const map = params.get('visao') === 'mapa'
  const listParams = new URLSearchParams(params); listParams.delete('visao')
  const mapParams = new URLSearchParams(params); mapParams.set('visao', 'mapa')
  return <nav aria-label="Visualização dos relatos" className="my-5 flex flex-wrap gap-3">
    <Link className={buttonStyles(map ? 'secondary' : 'primary')} to={`?${listParams}`} aria-current={!map ? 'page' : undefined}>Lista</Link>
    <Link className={buttonStyles(map ? 'primary' : 'secondary')} to={`?${mapParams}`} aria-current={map ? 'page' : undefined}>Mapa</Link>
  </nav>
}
