import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { LocationMap } from './LocationMap'
import { pointSchema, readPoint, type GeographicPoint } from './point'

export function LocationPicker({ value, onChange, disabled = false, error, focusError = true }: {
  value: GeographicPoint | null; onChange: (value: GeographicPoint) => void; disabled?: boolean; error?: string; focusError?: boolean
}) {
  const id = useId()
  const latitudeControl = useRef<HTMLInputElement>(null)
  const [latitude, setLatitude] = useState(value?.latitude.toString() ?? '')
  const [longitude, setLongitude] = useState(value?.longitude.toString() ?? '')
  const [suggestion, setSuggestion] = useState<GeographicPoint | null>(null)
  const [coordinatesOpen, setCoordinatesOpen] = useState(false)
  const [invalidDraft, setInvalidDraft] = useState(false)
  const [gpsMessage, setGpsMessage] = useState('')
  const [locating, setLocating] = useState(false)
  useEffect(() => {
    if (!invalidDraft && !error) return
    setCoordinatesOpen(true)
    if (!focusError && !invalidDraft) return
    const frame = requestAnimationFrame(() => latitudeControl.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [invalidDraft, error, focusError])
  const requestState = useRef({ generation: 0 })
  useEffect(() => {
    const state = requestState.current
    setLocating(false)
    if (disabled) setGpsMessage('')
    return () => { state.generation++ }
  }, [disabled])

  function confirm(point: GeographicPoint) {
    if (disabled) return
    requestState.current.generation++
    setLocating(false)
    setLatitude(point.latitude.toString()); setLongitude(point.longitude.toString())
    setInvalidDraft(false); setGpsMessage(''); setSuggestion(null); onChange(point)
  }
  function locate() {
    if (disabled || locating) return
    if (!window.isSecureContext || !navigator.geolocation) {
      setGpsMessage('Localização indisponível neste navegador ou conexão. Selecione no mapa ou informe as coordenadas.')
      return
    }
    const current = ++requestState.current.generation
    setLocating(true); setGpsMessage('Buscando sua posição…')
    navigator.geolocation.getCurrentPosition(position => {
      if (current !== requestState.current.generation) return
      setLocating(false)
      const result = pointSchema.safeParse({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      if (!result.success) { setGpsMessage('Posição indisponível. Selecione manualmente.'); return }
      setSuggestion(result.data)
      setLatitude(result.data.latitude.toString()); setLongitude(result.data.longitude.toString())
      setInvalidDraft(false)
      const accuracy = position.coords.accuracy
      setGpsMessage(`Posição sugerida${Number.isFinite(accuracy) && accuracy >= 0 ? `; precisão estimada de ${Math.ceil(accuracy)} m` : ''}. Confira o marcador de sugestão no mapa antes de confirmar.`)
    }, reason => {
      if (current !== requestState.current.generation) return
      setLocating(false)
      setGpsMessage(reason.code === 1 ? 'Permissão de localização negada. Selecione manualmente.'
        : reason.code === 3 ? 'Tempo de localização esgotado. Tente novamente ou selecione manualmente.'
          : 'Posição indisponível. Tente novamente ou selecione manualmente.')
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  }

  const draft = readPoint(latitude, longitude)
  const changed = draft && (draft.latitude !== value?.latitude || draft.longitude !== value?.longitude)
  return <fieldset disabled={disabled} className="grid min-w-0 gap-3" aria-describedby={`${id}-help ${id}-status`}>
    <legend className="font-bold">Local do problema</legend>
    <p id={`${id}-help`} className="text-small">Toque ou clique no mapa para marcar o problema. Pelo teclado, use “Informar coordenadas”.</p>
    <Button variant="secondary" disabled={disabled || locating} onClick={locate}><Icon name="location" />{locating ? 'Buscando posição…' : 'Usar minha localização'}</Button>
    <LocationMap point={value} suggestion={suggestion} disabled={disabled} onSelect={confirm} />
    <p id={`${id}-status`} role="status" className="text-small">{value ? 'Local confirmado.' : 'Nenhum local confirmado.'}</p>
    {gpsMessage && <p role="status" className="text-small">{gpsMessage}</p>}
    {suggestion && <div className="grid gap-3 rounded-control border border-border-control p-3">
      <p className="mb-0 text-small">O círculo indica sua posição sugerida. Ela pode ser diferente do local do problema.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={disabled} onClick={() => confirm(suggestion)}>Confirmar este local</Button>
        <Button variant="quiet" disabled={disabled} onClick={() => {
          setSuggestion(null); setGpsMessage(''); setLatitude(value?.latitude.toString() ?? ''); setLongitude(value?.longitude.toString() ?? '')
        }}>Descartar sugestão</Button>
      </div>
    </div>}
    <details open={coordinatesOpen} onToggle={event => setCoordinatesOpen(event.currentTarget.open)}>
      <summary className="min-h-target cursor-pointer py-3 font-bold underline">Informar coordenadas</summary>
      <p className="text-small text-text-secondary">Latitude (norte/sul) e longitude (leste/oeste), em graus decimais. O centro do mapa não confirma um local.</p>
      {value && <p className="text-small">Local confirmado: latitude {value.latitude.toFixed(6)}, longitude {value.longitude.toFixed(6)}.</p>}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Input ref={latitudeControl} label="Latitude" inputMode="decimal" value={latitude} disabled={disabled}
          description="De -90 a 90; use ponto decimal." error={error ?? (invalidDraft ? 'Informe um par de coordenadas válido.' : undefined)}
          onChange={event => { setLatitude(event.target.value); setInvalidDraft(false) }} />
        <Input label="Longitude" inputMode="decimal" value={longitude} disabled={disabled}
          description="De -180 a 180; use ponto decimal." aria-invalid={invalidDraft || undefined}
          onChange={event => { setLongitude(event.target.value); setInvalidDraft(false) }} />
      </div>
      <Button className="mt-3" variant="secondary" disabled={disabled} onClick={() => {
        if (draft) confirm(draft); else { setCoordinatesOpen(true); setInvalidDraft(true) }
      }}>Confirmar coordenadas</Button>
      {changed && <p role="status" className="text-small">Coordenadas ainda não confirmadas. O envio usa apenas o local confirmado.</p>}
    </details>
  </fieldset>
}
