import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Alert } from '../../components/ui/Feedback'
import { PhotoCollectionPicker } from './PhotoCollectionPicker'
import type { PhotoDraft } from './photo-draft'
import type { Occurrence } from '../occurrence/occurrence'
import { VideoPlaceholder } from '../occurrence/VideoPlaceholder'

export const VIDEO_HELP = 'Um vídeo MP4 H.264, até 25 MiB e 30 segundos, 720p (paisagem ou retrato), até 30 fps; áudio AAC opcional. MOV e HEVC não são aceitos.'
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
export function MediaPicker({ mode, onMode, value, onChange, existing, disabled, onValidationChange, errorId, active = true, onPreview }: {
  mode: 'IMAGE' | 'VIDEO'; onMode: (mode: 'IMAGE' | 'VIDEO') => void;
  value: PhotoDraft[]; onChange: (value: PhotoDraft[]) => void; existing?: Occurrence; disabled?: boolean;
  onValidationChange: (busy: boolean) => void; errorId?: string; active?: boolean; onPreview?: (key: string, url: string | null) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const [target, setTarget] = useState<'IMAGE' | 'VIDEO'>('IMAGE')
  const [error, setError] = useState<string | null>(null)
  function switchMode(next: 'IMAGE' | 'VIDEO', button: HTMLButtonElement) {
    if (next === mode) return
    trigger.current = button
    if (value.length) { setTarget(next); dialog.current?.showModal(); cancel.current?.focus() }
    else onMode(next)
  }
  return <section aria-label="Mídia do relato" className="grid min-w-0 gap-3">
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" aria-pressed={mode === 'IMAGE'} disabled={disabled} onClick={e => switchMode('IMAGE', e.currentTarget)}>Fotos</Button>
      <Button variant="secondary" aria-pressed={mode === 'VIDEO'} disabled={disabled} onClick={e => switchMode('VIDEO', e.currentTarget)}>Vídeo</Button>
    </div>
    {mode === 'IMAGE' ? <PhotoCollectionPicker value={value} onChange={onChange} existing={existing} disabled={disabled} onValidationChange={onValidationChange} errorId={errorId} active={active} onPreview={onPreview} /> : <>
      <p id="video-help" className="text-small text-text-secondary">{VIDEO_HELP}</p>
      <label className="grid min-w-0 gap-2">Escolher vídeo<input type="file" accept="video/mp4" disabled={disabled} aria-describedby="video-help" onChange={e => {
        const files = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''
        if (!files.length) return
        const file = files[0]
        if (files.length !== 1 || file.type !== 'video/mp4' || !file.size || file.size > 26214400) { setError('Escolha um MP4 de até 25 MiB. A seleção anterior foi mantida.'); return }
        setError(null); onChange([{ key: crypto.randomUUID(), file }])
      }} /></label>
      {value[0]?.file ? <><p className="break-all text-small">{value[0].file.name} · {(value[0].file.size / 1048576).toFixed(1)} MiB</p><Preview key={value[0].key} file={value[0].file} active={active} /></> : <VideoPlaceholder duration={existing?.media?.[0]?.type === 'VIDEO' ? existing.media[0].durationSeconds : undefined} />}
      <p className="text-small text-text-secondary">O servidor verifica o formato completo. Selecionar um arquivo não garante compatibilidade.</p>
    </>}
    {error && <Alert tone="danger" role="alert">{error}</Alert>}
    <Dialog ref={dialog} aria-labelledby="replace-media-title" onClose={() => trigger.current?.focus()} className="m-auto max-w-reading rounded-card border border-border-control bg-surface-raised p-6 text-text-primary backdrop:bg-text-primary/50">
      <h2 id="replace-media-title">Trocar o tipo de mídia?</h2>
      <p>O conjunto selecionado será removido do rascunho. No relato salvo, a troca só acontece ao salvar com sucesso.</p>
      <div className="flex flex-wrap gap-3"><Button ref={cancel} variant="secondary" onClick={() => dialog.current?.close()}>Cancelar</Button><Button onClick={() => { onChange([]); onMode(target); setError(null); dialog.current?.close() }}>Trocar mídia</Button></div>
    </Dialog>
  </section>
}
