import { useEffect, useRef } from 'react'
import type { Map as LeafletMap, Marker, CircleMarker } from 'leaflet'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { MapCanvas, type MapInitializer } from './MapCanvas'
import type { GeographicPoint } from './point'

export function LocationMap({ point, suggestion = null, disabled, active = true, onSelect }: {
  point: GeographicPoint | null; suggestion?: GeographicPoint | null; disabled: boolean; active?: boolean; onSelect: (point: GeographicPoint) => void
}) {
  const map = useRef<LeafletMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const suggestedMarker = useRef<CircleMarker | null>(null)
  const latest = useRef({ point, suggestion, disabled, onSelect })
  useEffect(() => { latest.current = { point, suggestion, disabled, onSelect } })
  useEffect(() => {
    if (suggestion && map.current && suggestedMarker.current) {
      suggestedMarker.current.setLatLng([suggestion.latitude, suggestion.longitude]).addTo(map.current)
      map.current.panTo([suggestion.latitude, suggestion.longitude], { animate: false })
    } else suggestedMarker.current?.remove()
  }, [suggestion])
  useEffect(() => {
    if (point && map.current && marker.current) {
      marker.current.setLatLng([point.latitude, point.longitude]).addTo(map.current)
      map.current.panTo([point.latitude, point.longitude], { animate: false })
    } else marker.current?.remove()
  }, [point])
  const initialize: MapInitializer = (instance, L) => {
    map.current = instance
    const initial = latest.current.point
    const selected = L.marker(initial ? [initial.latitude, initial.longitude] : instance.getCenter(), {
      icon: L.icon({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow,
        iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] }), keyboard: false, alt: 'Ponto escolhido',
    })
    marker.current = selected
    if (initial) { selected.addTo(instance); instance.setView([initial.latitude, initial.longitude], 16, { animate: false }) }
    // A dashed circle is a suggestion, never the confirmed pin. Semantic colors
    // come from the theme; shape and adjacent text also distinguish the states.
    const colors = getComputedStyle(instance.getContainer())
    const proposed = L.circleMarker(instance.getCenter(), { radius: 16, dashArray: '4 4',
      color: colors.getPropertyValue('--ds-report-analysis-foreground').trim(),
      fillColor: colors.getPropertyValue('--ds-report-analysis-background').trim(), fillOpacity: 0.7 })
    suggestedMarker.current = proposed
    if (latest.current.suggestion) {
      const next = latest.current.suggestion
      proposed.setLatLng([next.latitude, next.longitude]).addTo(instance)
      instance.panTo([next.latitude, next.longitude], { animate: false })
    }
    instance.getContainer().addEventListener('keydown', chooseCenter)
    function chooseCenter(event: KeyboardEvent) {
      if (event.key !== 'Enter' || event.target !== instance.getContainer() || latest.current.disabled) return
      event.preventDefault()
      const point = instance.getCenter().wrap()
      if (point.lat >= -90 && point.lat <= 90) latest.current.onSelect({ latitude: point.lat, longitude: point.lng })
    }
    instance.on('click', (event: L.LeafletMouseEvent) => {
      const position = event.latlng.wrap()
      if (!latest.current.disabled && position.lat >= -90 && position.lat <= 90)
        latest.current.onSelect({ latitude: position.lat, longitude: position.lng })
    })
    return () => { instance.getContainer().removeEventListener('keydown', chooseCenter); map.current = null; marker.current = null; suggestedMarker.current = null }
  }
  return <MapCanvas initialize={initialize} disabled={disabled} active={active} selecting />
}
