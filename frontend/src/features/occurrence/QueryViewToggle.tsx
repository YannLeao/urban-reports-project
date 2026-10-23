import { Icon } from '../../components/ui/Icon'
import { Link, useSearchParams } from 'react-router'
import { buttonStyles } from '../../components/ui/button-styles'

export function QueryViewToggle() {
  const [params] = useSearchParams()
  const map = params.get('visao') === 'mapa'
  const listParams = new URLSearchParams(params); listParams.delete('visao')
  const mapParams = new URLSearchParams(params); mapParams.set('visao', 'mapa')
  return <nav aria-label="Visualização dos relatos" className="grid w-full grid-cols-2 gap-1 rounded-pill border border-border-control bg-surface-raised p-1 sm:w-64">
    <Link className={buttonStyles(map ? 'secondary' : 'primary', '', 'compact')} to={`?${listParams}`} aria-current={!map ? 'page' : undefined}><Icon name="list" />Lista</Link>
    <Link className={buttonStyles(map ? 'primary' : 'secondary', '', 'compact')} to={`?${mapParams}`} aria-current={map ? 'page' : undefined}><Icon name="map" />Mapa</Link>
  </nav>
}
