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
