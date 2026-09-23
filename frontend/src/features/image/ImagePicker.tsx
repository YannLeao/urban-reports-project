import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Feedback'
import { checkImageDecoding, IMAGE_ACCEPT, validateImageFile } from './image-file'
import './image-picker.css'

export type ImagePickerProps = {
  value: File | null
  onChange: (file: File | null) => void
}

function Preview({ file }: { file: File }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url ? <img className="image-preview" src={url} alt="Prévia da imagem selecionada" /> : null
}

export function ImagePicker({ value, onChange }: ImagePickerProps) {
  const id = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const chooseButton = useRef<HTMLButtonElement>(null)
  const focusChooser = useRef(false)
  const pending = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    setBusy(false)
    return () => { pending.current?.abort() }
  }, [value])

  useEffect(() => {
    if (focusChooser.current && !busy) {
      chooseButton.current?.focus()
      focusChooser.current = false
    }
  }, [busy, value])

  async function select(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setError(null)
    const reason = validateImageFile(file)
    if (reason) {
      setBusy(false)
      setError(reason)
      return
    }
    setBusy(true)
    try {
      await checkImageDecoding(file, controller.signal)
      if (!controller.signal.aborted) onChange(file)
    } catch {
      if (!controller.signal.aborted) setError('Não conseguimos abrir essa imagem. Escolha outro arquivo JPEG, PNG ou WebP.')
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  function remove() {
    focusChooser.current = true
    pending.current?.abort()
    setBusy(false)
    setError(null)
    onChange(null)
  }

  const describedBy = `${id}-help ${id}-camera${error ? ` ${id}-error` : ''}`
  return <section className="image-picker" aria-label="Selecionar fotografia">
    <p id={`${id}-help`}>JPEG, PNG ou WebP, até 5 MiB. Selecione uma imagem por vez.</p>
    {value && <figure className="image-figure">
      <Preview file={value} />
      <figcaption>{value.name} · {value.size.toLocaleString('pt-BR')} bytes</figcaption>
    </figure>}
    <input hidden ref={fileInput} type="file" accept={IMAGE_ACCEPT} aria-label="Arquivo de imagem" aria-describedby={describedBy} disabled={busy} onChange={event => { void select(event) }} />
    <input hidden ref={cameraInput} type="file" accept={IMAGE_ACCEPT} capture="environment" aria-label="Fotografia pela câmera" aria-describedby={describedBy} disabled={busy} onChange={event => { void select(event) }} />
    <div className="image-actions">
      <Button ref={chooseButton} disabled={busy} aria-describedby={describedBy} onClick={() => fileInput.current?.click()}>{value ? 'Trocar imagem' : 'Escolher imagem'}</Button>
      <Button variant="secondary" disabled={busy} aria-describedby={describedBy} onClick={() => cameraInput.current?.click()}>{value ? 'Tirar outra foto' : 'Tirar foto'}</Button>
      {(value || busy) && <Button variant="quiet" onClick={remove}>Remover imagem</Button>}
    </div>
    <p id={`${id}-camera`} className="image-hint">A câmera depende do aparelho e do navegador. Se ela não abrir, use a escolha de arquivo.</p>
    <div role="status">{busy ? 'Verificando imagem…' : ''}</div>
    {error && <Alert id={`${id}-error`} tone="danger" role="alert">A nova imagem não foi aceita. {error}{value ? ' A imagem anterior foi mantida.' : ''}</Alert>}
  </section>
}
