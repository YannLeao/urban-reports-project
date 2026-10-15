import { useCallback, useEffect, useRef, useState } from 'react'
import type { LayerGroup, Map as LeafletMap } from 'leaflet'
import { Button } from '../../components/ui/Button'
import type { OccurrenceMarker } from '../occurrence/markers'
import { groupMarkers } from './group-markers'
import { MapCanvas, type Leaflet, type MapInitializer } from './MapCanvas'
import type { GeographicPoint } from './point'

export type MapView = GeographicPoint & { zoom: number }
export function OccurrenceMap({ items, selected, onSelect, onGroup, view, onView }: {
  items: OccurrenceMarker[]; selected: string | null; onSelect?: (id: string) => void
  onGroup?: (items: OccurrenceMarker[]) => void; view?: MapView; onView?: (view: MapView) => void
}) {
  const map = useRef<LeafletMap | null>(null)
  const library = useRef<Leaflet | null>(null)
  const layer = useRef<LayerGroup | null>(null)
  const latest = useRef({ items, selected, onSelect, onGroup, view, onView })
  const [adapter, setAdapter] = useState<typeof import('./pins/pin-icon') | null>(null)
  const [failure, setFailure] = useState(false)
  useEffect(() => {
    let active = true
    void import('./pins/pin-icon').then(value => { if (active) setAdapter(value) }).catch(() => { if (active) setFailure(true) })
    return () => { active = false }
  }, [])
  const draw = useCallback(() => {
    const instance = map.current, L = library.current, pins = layer.current
    if (!instance || !L || !pins || !adapter) return
    const focused = pins.getLayers().map(layer => (layer as import('leaflet').Marker).getElement()).find(element => element === document.activeElement)?.getAttribute('aria-label')
    let restoredFocus = false
    pins.clearLayers()
    const current = latest.current
    for (const group of groupMarkers(current.items, item => instance.project([item.latitude, item.longitude], instance.getZoom()))) {
      const item = group.items[0]
      const name = !current.onSelect ? `Local do relato: ${item.title}` : group.items.length === 1 ? `Selecionar relato: ${item.title}` : `${group.items.length} relatos próximos. Selecionar um relato do grupo`
      const marker = L.marker([item.latitude, item.longitude], {
        icon: L.divIcon({ html: adapter.pinMarkup(group.items, current.selected), className: '', iconSize: [48, 57], iconAnchor: [24, 55] }),
        title: name, keyboard: !!current.onSelect, interactive: !!current.onSelect, riseOnHover: true,
      }).addTo(pins)
      marker.getElement()?.setAttribute('aria-label', name)
      if (!current.onSelect && !current.onGroup) marker.getElement()?.setAttribute('role', 'img')
      if (focused === name) { marker.getElement()?.focus({ preventScroll: true }); restoredFocus = true }
      if (current.onSelect) marker.getElement()?.setAttribute('aria-pressed', String(group.items.some(value => value.id === current.selected)))
      const activate = () => group.items.length === 1 ? latest.current.onSelect?.(item.id) : latest.current.onGroup?.(group.items)
      marker.on('click', activate)
      if (current.onSelect) marker.getElement()?.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); event.stopPropagation(); activate()
        }
      })
    }
    if (focused && !restoredFocus) instance.getContainer().focus({ preventScroll: true })
  }, [adapter])
  // Updating data or selection redraws markers, but never changes the explored viewport.
  useEffect(() => { latest.current = { items, selected, onSelect, onGroup, view, onView } })
  useEffect(() => { draw() }, [items, selected, draw])
  function fit() {
    const instance = map.current, L = library.current
    if (!instance || !L || !latest.current.items.length) return
    instance.fitBounds(L.latLngBounds(latest.current.items.map(item => [item.latitude, item.longitude])), { padding: [40, 40], maxZoom: 16, animate: false })
  }
  const initialize: MapInitializer = (instance, L) => {
    map.current = instance; library.current = L; layer.current = L.layerGroup().addTo(instance)
    const initial = latest.current.view
    if (initial) instance.setView([initial.latitude, initial.longitude], initial.zoom, { animate: false })
    else fit()
    draw()
    instance.on('zoomend', draw)
    instance.on('moveend', () => {
      const center = instance.getCenter().wrap()
      latest.current.onView?.({ latitude: center.lat, longitude: center.lng, zoom: instance.getZoom() })
    })
    return () => { map.current = null; library.current = null; layer.current = null }
  }
  if (!adapter) return <div><p role="status">{failure ? 'Não foi possível carregar os pinos. Consulte os relatos em texto.' : 'Carregando mapa…'}</p>
    {failure && <><p>Recarregue a página para tentar novamente. O contexto da consulta será mantido na URL.</p><Button variant="secondary" onClick={() => window.location.reload()}>Recarregar página e pinos</Button></>}</div>
  return <div className="grid min-w-0 gap-3">
    <MapCanvas initialize={initialize} />
    {items.length > 0 && <Button variant="secondary" onClick={fit}>Reenquadrar relatos</Button>}
  </div>
}
