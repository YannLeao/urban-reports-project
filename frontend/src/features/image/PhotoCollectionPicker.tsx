import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { IconButton } from '../../components/ui/IconButton'
import { OccurrencePhoto } from '../occurrence/OccurrencePhoto'
import type { Occurrence } from '../occurrence/occurrence'
import type { PhotoDraft } from './photo-draft'

function LocalPreview({ file, position, onPreview }: { file: File; position: number; onPreview: (url: string | null) => void }) {
  const listener = useRef(onPreview)
  listener.current = onPreview
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const next = URL.createObjectURL(file)
    setUrl(next); listener.current(next)
    return () => { listener.current(null); URL.revokeObjectURL(next) }
  }, [file])
  return url ? <img src={url} alt={`Prévia da foto ${position + 1}`} className="h-full w-full object-contain" /> : null
}

// Each stable slot owns its URL, including while hidden. Thumbnails reuse it;
// saved photos are fetched on selection, never just to decorate the strip.
export function PhotoCollectionPicker({ value, onChange, existing, disabled = false, active = true, onPreview, onAdd }: {
  value: PhotoDraft[]; onChange: (items: PhotoDraft[]) => void; existing?: Occurrence
  disabled?: boolean; active?: boolean; onPreview?: (key: string, url: string | null) => void; onAdd: () => void
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const selected = Math.max(0, value.findIndex(item => item.key === selectedKey))
  const item = value[selected]
  const chooser = useRef<HTMLButtonElement>(null)
  const changed = useCallback((key: string, url: string | null) => {
    setPreviews(current => { const next = { ...current }; if (url) next[key] = url; else delete next[key]; return next })
    onPreview?.(key, url)
  }, [onPreview])
  function move(target: number) {
    if (!item) return
    const items = [...value]; items.splice(selected, 1); items.splice(target, 0, item)
    setSelectedKey(item.key); onChange(items)
  }
  function remove() {
    const next = value.filter(photo => photo.key !== item.key)
    setSelectedKey(next[Math.min(selected, next.length - 1)]?.key ?? null)
    onChange(next)
    requestAnimationFrame(() => chooser.current?.focus())
  }
  if (!item) return null
  return <section aria-label="Selecionar fotografia" className="grid min-w-0 gap-3">
    <div className="flex items-center justify-between gap-2">
      <p className="m-0 text-small" role="status">{selected + 1} de {value.length}{selected === 0 ? ' · Capa' : ''}</p>
      <span className="text-small text-text-secondary">{value.length} de 5 fotos</span>
    </div>
    <div className="relative min-w-0 overflow-hidden rounded-card border border-border-subtle bg-surface-raised">
      {value.map((photo, index) => <div key={photo.key} hidden={index !== selected} inert={index !== selected}
        className="h-[min(52vh,24rem)] min-w-0 [&>div]:m-0 [&>div]:h-full [&>div]:aspect-auto">
        {photo.file ? <LocalPreview file={photo.file} position={index} onPreview={url => changed(photo.key, url)} />
          : existing && <OccurrencePhoto report={existing} mediaId={photo.id} full active={active && index === selected} onPreview={url => changed(photo.key, url)} />}
      </div>)}
      <IconButton icon="trash" label={`Remover foto ${selected + 1}`} disabled={disabled} onClick={remove} className="absolute top-2 right-2 shadow-card" />
    </div>
    <div className="flex min-w-0 items-center gap-2">
      {value.length > 1 && <IconButton icon="chevronLeft" label="Foto anterior" disabled={disabled || selected === 0} onClick={() => setSelectedKey(value[selected - 1].key)} />}
      <div className="flex min-w-0 flex-1 snap-x snap-proximity gap-2 overflow-x-auto py-1" aria-label="Fotos selecionadas">
        {value.map((photo, index) => <button key={photo.key} ref={index === selected ? chooser : undefined} type="button"
          disabled={disabled} aria-label={`Selecionar foto ${index + 1}${index === 0 ? ', capa' : ''}`} aria-pressed={index === selected}
          onClick={event => { setSelectedKey(photo.key); event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) }}
          className={`flex h-16 w-16 min-h-target min-w-target shrink-0 snap-center items-center justify-center overflow-hidden rounded-control border-2 ${index === selected ? 'border-text-primary' : 'border-border-subtle'}`}>
          {previews[photo.key] ? <img src={previews[photo.key]} alt="" className="h-full w-full object-cover" /> : <span>{index + 1}</span>}
        </button>)}
        {value.length < 5 && <IconButton icon="plus" label="Adicionar fotos" disabled={disabled} onClick={onAdd} className="self-center" />}
      </div>
      {value.length > 1 && <IconButton icon="chevronRight" label="Próxima foto" disabled={disabled || selected === value.length - 1} onClick={() => setSelectedKey(value[selected + 1].key)} />}
    </div>
    {value.length === 5 && <p className="m-0 text-small text-text-secondary">Limite de 5 fotos atingido.</p>}
    {selected > 0 && <Button variant="quiet" className="justify-self-start" disabled={disabled} aria-label={`Definir foto ${selected + 1} como capa`} onClick={() => move(0)}>Usar como capa</Button>}
    {value.length > 1 && <details><summary className="min-h-target cursor-pointer py-3 text-small font-bold">Organizar fotos</summary>
      <div className="flex flex-wrap gap-2">
        {selected > 0 && <Button variant="quiet" disabled={disabled} aria-label={`Mover foto ${selected + 1} para antes`} onClick={() => move(selected - 1)}>Mover antes</Button>}
        {selected < value.length - 1 && <Button variant="quiet" disabled={disabled} aria-label={`Mover foto ${selected + 1} para depois`} onClick={() => move(selected + 1)}>Mover depois</Button>}
      </div>
    </details>}
  </section>
}
