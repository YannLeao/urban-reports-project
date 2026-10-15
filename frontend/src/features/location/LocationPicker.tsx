import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { LocationMap } from './LocationMap'
import { pointSchema, readPoint, type GeographicPoint } from './point'

export function LocationPicker({ value, onChange, disabled = false, error }: {
  value: GeographicPoint | null; onChange: (value: GeographicPoint) => void; disabled?: boolean; error?: string
}) {
  const id = useId()
  const latitudeControl = useRef<HTMLInputElement>(null)
  const [latitude, setLatitude] = useState(value?.latitude.toString() ?? '')
  const [longitude, setLongitude] = useState(value?.longitude.toString() ?? '')
  const [invalidDraft, setInvalidDraft] = useState(false)
  const [gpsMessage, setGpsMessage] = useState('')
  const [locating, setLocating] = useState(false)
  useEffect(() => { if (invalidDraft) latitudeControl.current?.focus() }, [invalidDraft])
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
    setInvalidDraft(false); setGpsMessage(''); onChange(point)
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
      setLatitude(result.data.latitude.toString()); setLongitude(result.data.longitude.toString())
      setInvalidDraft(false)
      const accuracy = position.coords.accuracy
      setGpsMessage(`Posição sugerida${Number.isFinite(accuracy) && accuracy >= 0 ? `; precisão estimada de ${Math.ceil(accuracy)} m` : ''}. Confira e confirme as coordenadas abaixo.`)
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
    <legend className="font-bold">Local da ocorrência</legend>
    <p id={`${id}-help`} className="text-small">Marque o local real do problema. Clicar no mapa confirma o ponto. Você também pode informar e confirmar latitude e longitude, em graus decimais.</p>
    <LocationMap point={value} disabled={disabled} onSelect={confirm} />
    <p id={`${id}-status`} role="status" className="break-words">{value
      ? `Local confirmado: latitude ${value.latitude.toFixed(6)}, longitude ${value.longitude.toFixed(6)}.`
      : 'Nenhum local confirmado.'}</p>
    <p className="text-small">Sua localização atual pode ser diferente do local do problema. O GPS apenas sugere coordenadas; confirme antes de enviar.</p>
    <Button variant="secondary" disabled={disabled || locating} onClick={locate}>{locating ? 'Buscando posição…' : 'Usar minha localização'}</Button>
    {gpsMessage && <p role="status">{gpsMessage}</p>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <Input ref={latitudeControl} label="Latitude" inputMode="decimal" value={latitude} disabled={disabled}
        description="De -90 a 90; use ponto decimal." error={error ?? (invalidDraft ? 'Informe um par de coordenadas válido.' : undefined)}
        onChange={event => { setLatitude(event.target.value); setInvalidDraft(false) }} />
      <Input label="Longitude" inputMode="decimal" value={longitude} disabled={disabled}
        description="De -180 a 180; use ponto decimal." aria-invalid={invalidDraft || undefined}
        onChange={event => { setLongitude(event.target.value); setInvalidDraft(false) }} />
    </div>
    <Button variant="secondary" disabled={disabled} onClick={() => {
      if (draft) confirm(draft); else setInvalidDraft(true)
    }}>Confirmar coordenadas</Button>
    {changed && <p role="status">Coordenadas sugeridas ainda não confirmadas. O envio usa apenas o local confirmado.</p>}
  </fieldset>
}
