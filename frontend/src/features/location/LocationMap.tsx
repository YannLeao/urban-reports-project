import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap, Marker } from 'leaflet'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { Button } from '../../components/ui/Button'
import { loadMapConfig } from './map-config'
import type { GeographicPoint } from './point'

function setMapDisabled(instance: LeafletMap, disabled: boolean) {
  const controls = instance.zoomControl.getContainer()
  if (controls) controls.inert = disabled
  instance.getContainer().setAttribute('aria-disabled', String(disabled))
  for (const handler of [instance.dragging, instance.keyboard, instance.doubleClickZoom, instance.touchZoom, instance.boxZoom]) {
    if (disabled) handler.disable(); else handler.enable()
  }
}

export function LocationMap({ point, disabled, onSelect }: {
  point: GeographicPoint | null; disabled: boolean; onSelect: (point: GeographicPoint) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const latest = useRef({ point, disabled, onSelect })
  useEffect(() => { latest.current = { point, disabled, onSelect } })
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    let dispose: (() => void) | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    void Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css'), loadMapConfig(controller.signal)])
      .then(([L, , config]) => {
        if (controller.signal.aborted || !container.current) return
        const initial = latest.current.point ?? config.center
        const instance = L.map(container.current, { scrollWheelZoom: false, worldCopyJump: true,
          center: [initial.latitude, initial.longitude], zoom: latest.current.point ? 16 : config.zoom })
        clearTimeout(initialTimeout)
        map.current = instance
        setMapDisabled(instance, latest.current.disabled)
        dispose = () => { instance.remove(); map.current = null; marker.current = null }
        instance.zoomControl.setPosition('topleft')
        instance.zoomControl.getContainer()?.querySelector('a')?.setAttribute('aria-label', 'Aproximar mapa')
        instance.zoomControl.getContainer()?.querySelectorAll('a')[1]?.setAttribute('aria-label', 'Afastar mapa')
        // Build attribution with DOM text, never provider/user HTML.
        const link = document.createElement('a')
        link.href = config.attributionUrl; link.textContent = config.attribution
        link.rel = 'noopener noreferrer'; link.target = '_blank'
        const tiles = L.tileLayer(config.tileUrl, { maxZoom: 19, keepBuffer: 0,
          referrerPolicy: 'strict-origin-when-cross-origin', attribution: link.outerHTML })
        let failed = false
        tiles.on('loading', () => {
          failed = false
          clearTimeout(timeout)
          timeout = setTimeout(() => setStatus('error'), 12000)
        })
        tiles.on('tileerror', () => { failed = true; setStatus('error') })
        tiles.on('load', () => { clearTimeout(timeout); if (!failed) setStatus('ready') })
        tiles.addTo(instance)
        const selected = L.marker([initial.latitude, initial.longitude], {
          icon: L.icon({ iconUrl: markerIcon,
            iconRetinaUrl: markerIcon2x,
            shadowUrl: markerShadow,
            iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] }),
          keyboard: false, alt: 'Ponto escolhido',
        })
        marker.current = selected
        if (latest.current.point) selected.addTo(instance)
        instance.on('click', (event: L.LeafletMouseEvent) => {
          if (latest.current.disabled) return
          const position = event.latlng.wrap()
          if (position.lat >= -90 && position.lat <= 90)
            latest.current.onSelect({ latitude: position.lat, longitude: position.lng })
        })
        const resize = new ResizeObserver(() => instance.invalidateSize())
        resize.observe(container.current)
        dispose = () => { resize.disconnect(); instance.remove(); map.current = null; marker.current = null }
      }).catch(() => { if (!controller.signal.aborted) setStatus('error') })
    const initialTimeout = setTimeout(() => setStatus('error'), 15000)
    return () => { controller.abort(); clearTimeout(timeout); clearTimeout(initialTimeout); dispose?.() }
  }, [attempt])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    if (point && marker.current) {
      marker.current.setLatLng([point.latitude, point.longitude]).addTo(instance)
      instance.panTo([point.latitude, point.longitude])
    } else marker.current?.remove()
  }, [point, status])
  useEffect(() => {
    const instance = map.current
    if (!instance) return
    setMapDisabled(instance, disabled)
  }, [disabled, status])

  return <div className="grid min-w-0 gap-2">
    <div ref={container} role="region" className="relative z-0 h-72 w-full rounded-control [&_.leaflet-control-zoom_a]:min-h-target [&_.leaflet-control-zoom_a]:min-w-target" aria-label="Mapa do local; use setas para mover e mais ou menos para zoom" />
    <p role="status">{status === 'loading' ? 'Carregando mapa…' : status === 'error'
      ? 'Não foi possível carregar o mapa completo. Tente novamente ou informe as coordenadas abaixo.'
      : 'Mapa carregado. Clique para confirmar o ponto ou use as coordenadas abaixo.'}</p>
    {status === 'error' && <Button disabled={disabled} variant="secondary" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>Tentar carregar mapa novamente</Button>}
  </div>
}
