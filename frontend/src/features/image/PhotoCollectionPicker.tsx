import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Feedback'
import { checkImageDecoding, IMAGE_ACCEPT, validateImageFile } from './image-file'
import { OccurrencePhoto } from '../occurrence/OccurrencePhoto'
import type { Occurrence } from '../occurrence/occurrence'

import type { PhotoDraft } from './photo-draft'

function LocalPreview({ file, position }: { file: File; position: number }) {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setPreview({ file, url })
    return () => URL.revokeObjectURL(url)
  }, [file])
  return preview?.file === file ? <img src={preview.url} alt={`Prévia da foto ${position + 1}`} className="aspect-[4/3] w-full object-contain" /> : null
}

export function PhotoCollectionPicker({ value, onChange, existing, disabled = false, onValidationChange, errorId }: {
  value: PhotoDraft[]; onChange: (items: PhotoDraft[]) => void; existing?: Occurrence
  disabled?: boolean; errorId?: string; onValidationChange?: (busy: boolean) => void
}) {
  const helpId = useId()
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const pending = useRef<AbortController | null>(null)
  const listener = useRef(onValidationChange)
  listener.current = onValidationChange
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => () => { pending.current?.abort(); listener.current?.(false) }, [value])
  function setValidating(next: boolean) { setBusy(next); listener.current?.(next) }
  async function select(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (!files.length || disabled || pending.current) return
    if (files.length + value.length > 5) { setError('Use no máximo 5 fotos. A seleção anterior foi mantida.'); return }
    const abort = new AbortController(); pending.current = abort
    setValidating(true); setError(null)
    try {
      for (let i = 0; i < files.length; i++) {
        const reason = validateImageFile(files[i])
        if (reason) throw new Error(`Foto ${value.length + i + 1}: ${reason}`)
        try { await checkImageDecoding(files[i], abort.signal) }
        catch { throw new Error(`Foto ${value.length + i + 1}: não foi possível abrir a imagem.`) }
      }
      if (!abort.signal.aborted) onChange([...value, ...files.map(file => ({ key: crypto.randomUUID(), file }))])
    } catch (failure) {
      if (!abort.signal.aborted) setError(`${failure instanceof Error ? failure.message : 'Seleção inválida.'} As fotos anteriores foram mantidas.`)
    } finally {
      if (!abort.signal.aborted) setValidating(false)
      if (pending.current === abort) pending.current = null
    }
  }
  function move(index: number, target: number) {
    const items = [...value]; const [item] = items.splice(index, 1); items.splice(target, 0, item)
    onChange(items)
  }
  return <section aria-label="Selecionar fotografia" className="grid min-w-0 gap-4">
    <p id={helpId} className="text-small text-text-secondary">{value.length}/5 fotos. Use de 1 a 5 fotos estáticas JPEG, PNG ou WebP, até 5 MiB por foto. A primeira é a capa.</p>
    <div className="flex flex-wrap gap-3">
      <Button ref={trigger} disabled={disabled || busy} aria-describedby={[helpId, errorId].filter(Boolean).join(" ")} onClick={() => camera.current?.click()}>Tirar foto</Button>
      <Button variant="secondary" disabled={disabled || busy} aria-describedby={[helpId, errorId].filter(Boolean).join(" ")} onClick={() => gallery.current?.click()}>Escolher da galeria</Button>
    </div>
    <p className="text-small text-text-secondary">Se a câmera não abrir, escolha da galeria.</p>
    <input hidden ref={gallery} type="file" multiple accept={IMAGE_ACCEPT} aria-label="Arquivo de imagem" disabled={disabled || busy} onChange={event => { void select(event) }} />
    <input hidden ref={camera} type="file" capture="environment" accept={IMAGE_ACCEPT} aria-label="Fotografia pela câmera" disabled={disabled || busy} onChange={event => { void select(event) }} />
    <ol className="m-0 grid min-w-0 list-none gap-4 p-0 sm:grid-cols-2">
      {value.map((item, index) => <li key={item.key} className="min-w-0 rounded-card border border-border-subtle p-3">
        <p className="font-bold">Foto {index + 1}{index === 0 ? ' · Capa' : ''}</p>
        {item.file ? <LocalPreview file={item.file} position={index} /> : existing && <OccurrencePhoto report={existing} mediaId={item.id} full />}
        <div className="flex flex-wrap gap-2">
          {index > 0 && <Button variant="quiet" disabled={disabled || busy} aria-label={`Definir foto ${index + 1} como capa`} onClick={() => move(index, 0)}>Usar como capa</Button>}
          <Button variant="quiet" disabled={disabled || busy || index === 0} aria-label={`Mover foto ${index + 1} para antes`} onClick={() => move(index, index - 1)}>Anterior</Button>
          <Button variant="quiet" disabled={disabled || busy || index === value.length - 1} aria-label={`Mover foto ${index + 1} para depois`} onClick={() => move(index, index + 1)}>Próxima</Button>
          <Button variant="quiet" disabled={disabled || busy} aria-label={`Remover foto ${index + 1}`} onClick={() => { onChange(value.filter(photo => photo.key !== item.key)); trigger.current?.focus() }}>Remover imagem</Button>
        </div>
      </li>)}
    </ol>
    {busy && <p role="status">Verificando imagens…</p>}
    {error && <Alert tone="danger" role="alert">{error}</Alert>}
  </section>
}
