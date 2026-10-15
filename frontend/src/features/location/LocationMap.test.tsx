import { useEffect, useRef } from 'react'
import { render } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { Map as LeafletMap } from 'leaflet'
import type { Leaflet, MapInitializer } from './MapCanvas'
import { LocationMap } from './LocationMap'

const { instance, confirmed, suggested, library } = vi.hoisted(() => {
  const layer = () => ({ setLatLng: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(), remove: vi.fn() })
  const confirmed = layer(), suggested = layer()
  const instance = { panTo: vi.fn(), setView: vi.fn(), getCenter: () => ({ lat: -8.336, lng: -36.424 }), on: vi.fn(), getContainer: () => document.createElement('div') }
  return { instance, confirmed, suggested, library: { marker: () => confirmed, circleMarker: () => suggested, icon: vi.fn() } }
})
vi.mock('./MapCanvas', () => ({ MapCanvas: ({ initialize }: { initialize: MapInitializer }) => {
  const initial = useRef(initialize)
  useEffect(() => initial.current(instance as unknown as LeafletMap, library as unknown as Leaflet), [])
  return <div>Mapa</div>
} }))
beforeEach(() => vi.clearAllMocks())

test('a GPS suggestion pans a distinct layer without moving the confirmed pin; unrelated rerenders preserve exploration', () => {
  const point = { latitude: 0, longitude: 12 }
  const suggestion = { latitude: -8.34, longitude: -36.43 }
  const onSelect = vi.fn()
  const view = render(<LocationMap point={point} disabled={false} onSelect={onSelect} />)
  expect(instance.setView).toHaveBeenCalledWith([0, 12], 16, { animate: false })
  instance.panTo.mockClear(); confirmed.setLatLng.mockClear()
  view.rerender(<LocationMap point={point} suggestion={suggestion} disabled={false} onSelect={onSelect} />)
  expect(suggested.setLatLng).toHaveBeenLastCalledWith([-8.34, -36.43])
  expect(instance.panTo).toHaveBeenCalledExactlyOnceWith([-8.34, -36.43], { animate: false })
  expect(confirmed.setLatLng).not.toHaveBeenCalled()
  expect(onSelect).not.toHaveBeenCalled()
  view.rerender(<LocationMap point={point} suggestion={suggestion} disabled onSelect={onSelect} />)
  expect(instance.panTo).toHaveBeenCalledTimes(1)
  view.rerender(<LocationMap point={point} suggestion={null} disabled={false} onSelect={onSelect} />)
  expect(suggested.remove).toHaveBeenCalled()
  expect(confirmed.remove).not.toHaveBeenCalled()
})
