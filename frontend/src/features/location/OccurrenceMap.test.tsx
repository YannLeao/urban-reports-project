import { useEffect, useRef } from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { Map as LeafletMap } from 'leaflet'
import { OccurrenceMap } from './OccurrenceMap'
import type { Leaflet, MapInitializer } from './MapCanvas'

const { instance, library, events } = vi.hoisted(() => {
  const events = new Map<string, () => void>()
  const instance = {
    fitBounds: vi.fn(), setView: vi.fn(), on: vi.fn((event: string, callback: () => void) => events.set(event, callback)),
    project: () => ({ x: 100, y: 100 }), getZoom: () => 14,
    getCenter: () => ({ wrap: () => ({ lat: -8, lng: -36 }) }), getContainer: () => document.createElement('div'),
  }
  const pins = { addTo: () => pins, clearLayers: vi.fn(), getLayers: () => [] }
  const marker = { addTo: vi.fn().mockReturnThis(), getElement: () => null, on: vi.fn() }
  return { instance, events, library: { layerGroup: () => pins, marker: () => marker, divIcon: vi.fn(), latLngBounds: vi.fn(points => points) } }
})
vi.mock('./pins/pin-icon', () => ({ pinMarkup: () => '' }))
vi.mock('./MapCanvas', () => ({ MapCanvas: ({ initialize }: { initialize: MapInitializer }) => {
  const initial = useRef(initialize)
  useEffect(() => initial.current(instance as unknown as LeafletMap, library as unknown as Leaflet), [])
  return <div>Mapa de teste</div>
} }))
const point = { id: '3e85aa3d-19e3-42a3-8861-c435ff5908af', title: 'Relato', categoryId: 1 as const, categoryName: 'Iluminação', status: 'PENDING' as const, latitude: -8.336, longitude: -36.424 }
beforeEach(() => { instance.fitBounds.mockClear(); instance.setView.mockClear(); events.clear() })
test('restored viewport wins over the marker bounds and selection/refresh never recenters', async () => {
  const view = { latitude: 0, longitude: 12, zoom: 7 }
  const mounted = render(<OccurrenceMap items={[point]} selected={null} view={view} />)
  await waitFor(() => expect(instance.setView).toHaveBeenCalledWith([0, 12], 7, { animate: false }))
  expect(instance.fitBounds).not.toHaveBeenCalled()
  mounted.rerender(<OccurrenceMap items={[{ ...point, latitude: 23 }]} selected={point.id} view={{ ...view, latitude: 25 }} />)
  expect(instance.setView).toHaveBeenCalledTimes(1)
  expect(instance.fitBounds).not.toHaveBeenCalled()
})
test('without restored viewport points are fitted once; no points leave the configured fallback untouched', async () => {
  const mounted = render(<OccurrenceMap items={[point]} selected={null} />)
  await waitFor(() => expect(instance.fitBounds).toHaveBeenCalledWith([[point.latitude, point.longitude]], expect.objectContaining({ maxZoom: 16 })))
  mounted.unmount(); instance.fitBounds.mockClear()
  render(<OccurrenceMap items={[]} selected={null} />)
  await waitFor(() => expect(events.has('moveend')).toBe(true))
  expect(instance.fitBounds).not.toHaveBeenCalled()
  expect(instance.setView).not.toHaveBeenCalled()
})
test('manual exploration reports the new viewport for navigation without changing points', async () => {
  const changed = vi.fn()
  render(<OccurrenceMap items={[point]} selected={null} onView={changed} />)
  await waitFor(() => expect(events.has('moveend')).toBe(true))
  events.get('moveend')!()
  expect(changed).toHaveBeenCalledWith({ latitude: -8, longitude: -36, zoom: 14 })
})
