import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { Button } from '../../components/ui/Button'
import { loadMapConfig } from './map-config'

export type Leaflet = typeof import('leaflet')
export type MapInitializer = (map: LeafletMap, leaflet: Leaflet) => (() => void) | void

function setMapDisabled(instance: LeafletMap, disabled: boolean) {
  const controls = instance.zoomControl.getContainer()
  if (controls) controls.inert = disabled
  instance.getContainer().setAttribute('aria-disabled', String(disabled))
  for (const handler of [instance.dragging, instance.keyboard, instance.doubleClickZoom, instance.touchZoom, instance.boxZoom]) {
    if (disabled) handler.disable(); else handler.enable()
  }
}

export function MapCanvas({ initialize, disabled = false, selecting = false }: {
  initialize: MapInitializer; disabled?: boolean; selecting?: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const latest = useRef({ initialize, disabled })
  useEffect(() => { latest.current = { initialize, disabled } })
  const [attempt, setAttempt] = useState(0)
  const [codeFailed, setCodeFailed] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    const controller = new AbortController()
    let dispose: (() => void) | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    void Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css'), loadMapConfig(controller.signal)])
      .then(([L, , config]) => {
        if (controller.signal.aborted || !container.current) return
        const initial = config.center
        const instance = L.map(container.current, { scrollWheelZoom: false, worldCopyJump: true,
          center: [initial.latitude, initial.longitude], zoom: config.zoom })
        clearTimeout(initialTimeout)
        map.current = instance
        dispose = () => { instance.remove(); map.current = null }
        instance.zoomControl.setPosition('topleft')
        instance.zoomControl.getContainer()?.querySelector('a')?.setAttribute('aria-label', 'Aproximar mapa')
        instance.zoomControl.getContainer()?.querySelectorAll('a')[1]?.setAttribute('aria-label', 'Afastar mapa')
        setMapDisabled(instance, latest.current.disabled)
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
        const release = latest.current.initialize(instance, L)
        tiles.addTo(instance)
        const resize = new ResizeObserver(() => instance.invalidateSize())
        resize.observe(container.current)
        dispose = () => { resize.disconnect(); release?.(); instance.remove(); map.current = null }
      }).catch(() => { if (!controller.signal.aborted) { setCodeFailed(true); setStatus('error') } })
    const initialTimeout = setTimeout(() => setStatus('error'), 15000)
    return () => { controller.abort(); clearTimeout(timeout); clearTimeout(initialTimeout); dispose?.() }
  }, [attempt])

  useEffect(() => { if (map.current) setMapDisabled(map.current, disabled) }, [disabled])
  return <div className="grid min-w-0 gap-2">
    <div ref={container} role="region" className="relative z-0 h-72 w-full rounded-control [&_.leaflet-control-zoom_a]:min-h-target [&_.leaflet-control-zoom_a]:min-w-target" aria-label="Mapa do local; use setas para mover e mais ou menos para zoom" />
    <p role="status">{status === 'loading' ? 'Carregando mapa…' : status === 'error'
      ? selecting ? 'Não foi possível carregar o mapa completo. Tente novamente ou informe as coordenadas abaixo.' : 'Não foi possível carregar o mapa completo. Tente novamente ou consulte os relatos em texto.'
      : selecting ? 'Mapa carregado. Clique para confirmar o ponto ou use as coordenadas abaixo.' : 'Mapa carregado.'}</p>
    {codeFailed && !selecting && <p>Recarregue a página para tentar carregar o mapa. O contexto da consulta será mantido na URL.</p>}
    {status === 'error' && <Button disabled={disabled} variant="secondary" onClick={() => {
      if (codeFailed && !selecting) window.location.reload()
      else { setCodeFailed(false); setStatus('loading'); setAttempt(value => value + 1) }
    }}>{codeFailed && !selecting ? 'Recarregar página e mapa' : 'Tentar carregar mapa novamente'}</Button>}
  </div>
}
