import { useEffect, useRef } from 'react'
import type { Map as LeafletMap, Marker } from 'leaflet'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { MapCanvas, type MapInitializer } from './MapCanvas'
import type { GeographicPoint } from './point'

export function LocationMap({ point, disabled, onSelect }: {
  point: GeographicPoint | null; disabled: boolean; onSelect: (point: GeographicPoint) => void
}) {
  const map = useRef<LeafletMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const latest = useRef({ point, disabled, onSelect })
  useEffect(() => { latest.current = { point, disabled, onSelect } })
  useEffect(() => {
    if (point && map.current && marker.current) {
      marker.current.setLatLng([point.latitude, point.longitude]).addTo(map.current)
      map.current.panTo([point.latitude, point.longitude])
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
    if (initial) { selected.addTo(instance); instance.setView([initial.latitude, initial.longitude], 16) }
    instance.on('click', (event: L.LeafletMouseEvent) => {
      const position = event.latlng.wrap()
      if (!latest.current.disabled && position.lat >= -90 && position.lat <= 90)
        latest.current.onSelect({ latitude: position.lat, longitude: position.lng })
    })
    return () => { map.current = null; marker.current = null }
  }
  return <MapCanvas initialize={initialize} disabled={disabled} selecting />
}
