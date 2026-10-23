import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { IconButton } from '../../components/ui/IconButton'
import { Dialog } from '../../components/ui/Dialog'
import { Alert } from '../../components/ui/Feedback'
import { PhotoCollectionPicker } from './PhotoCollectionPicker'
import { checkImageDecoding, IMAGE_ACCEPT, validateImageFile } from './image-file'
import type { PhotoDraft } from './photo-draft'
import type { Occurrence } from '../occurrence/occurrence'
import { VideoPlaceholder } from '../occurrence/VideoPlaceholder'

export const VIDEO_HELP = 'MP4 H.264, até 25 MiB e 30 segundos, 720p (paisagem ou retrato), até 30 fps; áudio AAC opcional. MOV e HEVC não são aceitos. A compatibilidade completa é verificada no envio.'
function Preview({ file, active }: { file: File; active: boolean }) {
  const video = useRef<HTMLVideoElement | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => { const url = URL.createObjectURL(file); setSrc(url); return () => URL.revokeObjectURL(url) }, [file])
  useEffect(() => {
    const element = video.current
    return () => { if (element) { element.pause(); element.removeAttribute('src'); element.load() } }
  }, [src])
  useEffect(() => { if (!active) video.current?.pause() }, [active, src])
  return src ? <video ref={video} src={src} controls playsInline preload="none" className="max-h-[24rem] w-full rounded-card" aria-label="Prévia local do vídeo" /> : null
}
export function MediaPicker({ mode, onMode, value, onChange, existing, disabled = false, onValidationChange, errorId, active = true, onPreview }: {
  mode: 'IMAGE' | 'VIDEO'; onMode: (mode: 'IMAGE' | 'VIDEO') => void
  value: PhotoDraft[]; onChange: (value: PhotoDraft[]) => void; existing?: Occurrence; disabled?: boolean
  onValidationChange: (busy: boolean) => void; errorId?: string; active?: boolean; onPreview?: (key: string, url: string | null) => void
}) {
  const id = useId()
  // Draft-only React identities: no UUID/security contract or secure-context API.
  const nextDraftKey = useRef(0)
  const gallery = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null), recording = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const pending = useRef<AbortController | null>(null)
  const listener = useRef(onValidationChange); listener.current = onValidationChange
  const [replacement, setReplacement] = useState<{ mode: 'IMAGE' | 'VIDEO'; items: PhotoDraft[] } | null>(null)
  const [busy, setBusy] = useState(false), [menu, setMenu] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => () => { pending.current?.abort(); listener.current(false) }, [])
  async function select(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''
    if (!files.length || disabled || pending.current || !active) return
    const abort = new AbortController(); pending.current = abort
    setBusy(true); listener.current(true); setError(null); setMenu(false)
    try {
      const nextMode = files.every(file => file.type.startsWith('image/')) ? 'IMAGE' : 'VIDEO'
      if (nextMode === 'VIDEO') {
        if (files.length !== 1 || files[0].type !== 'video/mp4' || !files[0].size || files[0].size > 26214400)
          throw new Error('Escolha fotos ou um único vídeo MP4 de até 25 MiB. Lotes mistos, MOV e HEVC não são aceitos.')
      } else {
        if (files.length + (mode === 'IMAGE' ? value.length : 0) > 5) throw new Error('Use no máximo 5 fotos.')
        for (const [index, file] of files.entries()) {
          const reason = validateImageFile(file)
          if (reason) throw new Error(`Foto ${index + 1}: ${reason}`)
          try { await checkImageDecoding(file, abort.signal) } catch { throw new Error(`Foto ${index + 1}: não foi possível abrir a imagem.`) }
        }
      }
      if (abort.signal.aborted) return
      const items = files.map(file => ({ key: `${id}-media-${nextDraftKey.current++}`, file }))
      if (value.length && (nextMode !== mode || mode === 'VIDEO')) {
        setReplacement({ mode: nextMode, items }); dialog.current?.showModal(); cancel.current?.focus()
      } else { onMode(nextMode); onChange(nextMode === 'IMAGE' ? [...value, ...items] : items) }
    } catch (failure) {
      if (!abort.signal.aborted) setError(`${failure instanceof Error ? failure.message : 'Seleção inválida.'} A seleção anterior foi mantida.`)
    } finally {
      if (!abort.signal.aborted) { setBusy(false); listener.current(false) }
      if (pending.current === abort) pending.current = null
    }
  }
  const blocked = disabled || busy || !active
  return <section aria-label="Mídia do relato" className="grid min-w-0 gap-3">
    {value.length === 0 && <p id={`${id}-help`} className="m-0 text-small text-text-secondary">Até 5 fotos ou 1 vídeo</p>}
    <div className={value.length ? 'flex min-w-0 flex-wrap gap-2' : 'grid min-w-0 gap-3'}>
      <Button ref={trigger} variant="secondary" disabled={blocked} aria-expanded={menu} aria-controls={`${id}-camera`}
        aria-describedby={[errorId, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined} onClick={() => setMenu(current => !current)}
        className={value.length ? '' : 'min-h-40! flex-col rounded-card! border-dashed'}>
        <Icon name="camera" className={value.length ? '' : 'h-12 w-12'} />{value.length ? 'Câmera' : 'Adicionar foto ou vídeo'}
      </Button>
      <Button variant="quiet" disabled={blocked} aria-describedby={error ? `${id}-error` : errorId} onClick={() => gallery.current?.click()}><Icon name="gallery" />Galeria</Button>
    </div>
    {menu && <div id={`${id}-camera`} className="flex flex-wrap gap-2" aria-label="Captura pela câmera">
      <Button variant="secondary" disabled={blocked} onClick={() => camera.current?.click()}><Icon name="camera" />Fotografar</Button>
      <Button variant="secondary" disabled={blocked} onClick={() => recording.current?.click()}><Icon name="play" />Gravar vídeo</Button>
    </div>}
    <input hidden ref={gallery} type="file" multiple accept={`${IMAGE_ACCEPT},video/mp4`} aria-label="Fotos ou vídeo da galeria" disabled={blocked} onChange={e => { void select(e) }} />
    <input hidden ref={camera} type="file" capture="environment" accept={IMAGE_ACCEPT} aria-label="Fotografia pela câmera" disabled={blocked} onChange={e => { void select(e) }} />
    <input hidden ref={recording} type="file" capture="environment" accept="video/mp4" aria-label="Vídeo pela câmera" disabled={blocked} onChange={e => { void select(e) }} />
    {busy && <p role="status">Verificando imagens…</p>}
    {error && <Alert id={`${id}-error`} tone="danger" role="alert">{error}</Alert>}
    {mode === 'IMAGE' && value.length > 0 && <PhotoCollectionPicker value={value} onChange={items => { onChange(items); if (!items.length) requestAnimationFrame(() => trigger.current?.focus()) }} existing={existing} disabled={blocked} active={active} onPreview={onPreview} onAdd={() => gallery.current?.click()} />}
    {mode === 'VIDEO' && value.length > 0 && <div className="grid min-w-0 gap-3">
      <div className="flex items-center justify-between gap-2"><p className="m-0 text-small">1 vídeo · MP4</p><IconButton icon="trash" label="Remover vídeo" disabled={blocked} onClick={() => { onChange([]); trigger.current?.focus() }} /></div>
      {value[0].file ? <Preview key={value[0].key} file={value[0].file} active={active} /> : <VideoPlaceholder duration={existing?.media?.[0]?.type === 'VIDEO' ? existing.media[0].durationSeconds : undefined} />}
    </div>}
    <details className="text-small text-text-secondary"><summary className="min-h-target cursor-pointer py-3">Formatos e limites</summary><p>Fotos JPEG, PNG ou WebP, até 5 MiB por foto. A primeira é a capa.</p><p>{VIDEO_HELP}</p><p>A câmera depende do aparelho. Se o formato não for aceito, use a galeria.</p></details>
    <Dialog ref={dialog} aria-labelledby={`${id}-replace`} onClose={() => { setReplacement(null); trigger.current?.focus() }} className="m-auto max-w-reading rounded-card border border-border-control bg-surface-raised p-6 text-text-primary backdrop:bg-text-primary/50">
      <h2 id={`${id}-replace`}>{replacement?.mode === mode ? 'Substituir mídia?' : 'Trocar o tipo de mídia?'}</h2><p>A seleção atual será substituída. O relato salvo só muda ao salvar.</p>
      <div className="flex flex-wrap gap-3"><Button ref={cancel} variant="secondary" onClick={() => { setReplacement(null); dialog.current?.close(); trigger.current?.focus() }}>Cancelar</Button><Button onClick={() => { if (replacement) { onMode(replacement.mode); onChange(replacement.items) }; setReplacement(null); dialog.current?.close(); trigger.current?.focus() }}>Trocar mídia</Button></div>
    </Dialog>
  </section>
}
