import { readPoint } from '../location/point'
import type { MapView } from '../location/OccurrenceMap'

export function readView(params: URLSearchParams): MapView | undefined {
  const point = readPoint(params.get('lat') ?? '', params.get('lng') ?? '')
  const zoom = Number(params.get('zoom'))
  return point && params.has('zoom') && Number.isInteger(zoom) && zoom >= 0 && zoom <= 19 ? { ...point, zoom } : undefined
}
export function queryReturn(value: unknown, own: boolean) {
  const base = own ? '/meus-relatos' : '/ocorrencias'
  if (typeof value !== 'string') return base
  // Never turn a navigation state value into an external/open redirect.
  return value === base || value.startsWith(`${base}?`) ? value : base
}

export function queryMap(value: unknown, own: boolean) {
  const from = queryReturn(value, own)
  const params = new URLSearchParams(from.split('?')[1])
  params.set('visao', 'mapa')
  return `${own ? '/meus-relatos' : '/ocorrencias'}?${params}`
}
