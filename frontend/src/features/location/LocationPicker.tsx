import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import { Button } from '../../components/ui/Button'
import { LocationMap } from './LocationMap'
import { pointSchema, type GeographicPoint } from './point'

export function LocationPicker({ value, onChange, disabled = false, active = true, autoLocate = false, error, focusError = true }: {
  value: GeographicPoint | null; onChange: (value: GeographicPoint) => void; disabled?: boolean
  active?: boolean; autoLocate?: boolean; error?: string; focusError?: boolean
}) {
  const id = useId()
  const control = useRef<HTMLButtonElement>(null)
  const [suggestion, setSuggestion] = useState<GeographicPoint | null>(null)
  const [gpsMessage, setGpsMessage] = useState('')
  const [locating, setLocating] = useState(false)
  const attempted = useRef(false)
  const requestState = useRef({ generation: 0 })
  const busy = useRef(false)
  const locate = useCallback(() => {
    if (disabled || !active || busy.current) return
    if (!window.isSecureContext || !navigator.geolocation) {
      setGpsMessage('Localização indisponível neste navegador ou conexão. Toque no mapa para escolher o local.')
      return
    }
    const current = ++requestState.current.generation
    busy.current = true; setLocating(true); setGpsMessage('Buscando sua posição…')
    navigator.geolocation.getCurrentPosition(position => {
      if (current !== requestState.current.generation) return
      busy.current = false; setLocating(false)
      const result = pointSchema.safeParse({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      if (!result.success) { setGpsMessage('Posição indisponível. Toque no mapa para escolher o local.'); return }
      setSuggestion(result.data)
      const accuracy = position.coords.accuracy
      setGpsMessage(`Posição sugerida${Number.isFinite(accuracy) && accuracy >= 0 ? `; precisão estimada de ${Math.ceil(accuracy)} m` : ''}. Confira o local antes de confirmar.`)
    }, reason => {
      if (current !== requestState.current.generation) return
      busy.current = false; setLocating(false)
      setGpsMessage(reason.code === 1 ? 'Permissão de localização negada. Toque no mapa para escolher o local.'
        : reason.code === 3 ? 'Tempo de localização esgotado. Tente novamente ou escolha no mapa.'
          : 'Posição indisponível. Tente novamente ou escolha no mapa.')
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  }, [active, disabled])
  useEffect(() => {
    const snapshot = requestState.current
    setLocating(false); busy.current = false
    // Defer one tick: Strict Mode's setup/cleanup probe must not issue two GPS requests.
    const timer = active && !disabled && autoLocate && !value && !attempted.current ? setTimeout(() => {
      attempted.current = true; locate()
    }, 0) : undefined
    return () => { clearTimeout(timer); snapshot.generation++; busy.current = false }
  }, [active, disabled, autoLocate, locate, value])
  useEffect(() => { if (active && error && focusError) control.current?.focus() }, [active, error, focusError])

  function confirm(point: GeographicPoint) {
    if (disabled || !active) return
    requestState.current.generation++; busy.current = false; setLocating(false)
    setGpsMessage(''); setSuggestion(null); onChange(point)
  }
  return <fieldset disabled={disabled || !active} className="grid min-w-0 gap-3" aria-describedby={`${id}-help ${id}-status`}>
    <legend className="font-bold">Local do problema</legend>
    <p id={`${id}-help`} className="text-small">{autoLocate ? 'Vamos tentar sugerir o local do dispositivo. Confirme a sugestão ou ajuste o pino.' : 'Escolha o local do problema no mapa; localização do dispositivo é opcional.'} Toque no mapa para ajustar o local. Pelo teclado, mova o mapa com as setas e use Enter para escolher seu centro.</p>
    <div className="relative min-w-0">
      <LocationMap point={value} suggestion={suggestion} disabled={disabled || !active} active={active} onSelect={confirm} />
      <Button ref={control} variant="secondary" className="absolute top-28 left-3 z-[1000] h-target w-target min-h-target min-w-target rounded-control! bg-surface-raised p-0! shadow-card"
        aria-label="Usar minha localização" title="Usar minha localização" aria-busy={locating || undefined}
        disabled={disabled || !active || locating} onClick={locate}><Icon name="location" /></Button>
    </div>
    <p id={`${id}-status`} role="status" className="text-small">{value ? 'Local confirmado.' : 'Nenhum local confirmado.'}</p>
    {gpsMessage && <p role="status" className="text-small">{gpsMessage}</p>}
    {suggestion && <div className="grid gap-3 rounded-control border border-border-control p-3">
      <p className="mb-0 text-small">O círculo indica uma sugestão, que pode ser diferente do local do problema. Você pode confirmá-la mesmo se o mapa não carregar.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={disabled || !active} onClick={() => confirm(suggestion)}>Confirmar este local</Button>
        <Button variant="quiet" disabled={disabled || !active} onClick={() => { setSuggestion(null); setGpsMessage('') }}>Descartar sugestão</Button>
      </div>
    </div>}
    {error && <p role="alert" className="text-small text-feedback-danger-foreground">{error}</p>}
  </fieldset>
}
