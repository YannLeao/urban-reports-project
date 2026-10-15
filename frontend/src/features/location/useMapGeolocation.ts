import { useEffect, useRef, useState } from 'react'
import { pointSchema, type GeographicPoint } from './point'

// One optional lookup for exploration. No watch, persistence or backend request.
export function useMapGeolocation(onLocate: (point: GeographicPoint) => void) {
  const [message, setMessage] = useState('')
  const [locating, setLocating] = useState(false)
  const generation = useRef(0)
  const busy = useRef(false)
  const callback = useRef(onLocate)
  useEffect(() => { callback.current = onLocate })
  useEffect(() => () => { generation.current++; busy.current = false }, [])

  function locate() {
    if (busy.current) return
    if (!window.isSecureContext || !navigator.geolocation) {
      setMessage('Sua localização não está disponível neste navegador. Continue explorando o mapa.')
      return
    }
    const current = ++generation.current
    busy.current = true; setLocating(true); setMessage('Buscando sua localização…')
    navigator.geolocation.getCurrentPosition(position => {
      if (current !== generation.current) return
      busy.current = false; setLocating(false)
      const result = pointSchema.safeParse({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      if (!result.success) { setMessage('Não encontramos sua localização. Continue explorando o mapa.'); return }
      callback.current(result.data)
      setMessage('Mapa centralizado perto de você. A posição pode ser aproximada.')
    }, reason => {
      if (current !== generation.current) return
      busy.current = false; setLocating(false)
      setMessage(reason.code === 1 ? 'Permissão de localização negada. Você pode explorar o mapa manualmente.'
        : reason.code === 3 ? 'A localização demorou a responder. Tente novamente ou explore o mapa.'
          : 'Não encontramos sua localização. Tente novamente ou explore o mapa.')
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 })
  }
  return { locate, locating, message }
}
