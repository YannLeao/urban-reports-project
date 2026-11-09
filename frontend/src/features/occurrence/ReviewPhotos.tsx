import { useRef, useState } from 'react'
import type { PhotoDraft } from '../image/photo-draft'
import type { Occurrence } from './occurrence'
import { OccurrencePhoto } from './OccurrencePhoto'
import { PhotoLightbox } from './PhotoLightbox'
import { Icon } from '../../components/ui/Icon'

export function ReviewPhotos({ photos, previews, existing, active, disabled }: {
  photos: PhotoDraft[]; previews: Record<string, string>; existing?: Occurrence; active: boolean; disabled: boolean
}) {
  const [loaded, setLoaded] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const expanded = photos.findIndex(photo => photo.key === expandedKey)
  const expandedPhoto = photos[expanded]
  const url = expandedPhoto && (previews[expandedPhoto.key] ?? loaded[expandedPhoto.key])
  const alt = (index: number) => `Foto ${index + 1} de ${photos.length} do relato em revisão${index === 0 ? ' (capa)' : ''}`
  return <>
    <div hidden aria-hidden="true">{photos.filter(photo => !photo.file && !previews[photo.key]).map(photo => existing &&
      <OccurrencePhoto key={photo.key} report={existing} mediaId={photo.id} full active={active}
        onPreview={src => setLoaded(current => { const next = { ...current }; if (src) next[photo.key] = src; else delete next[photo.key]; return next })}
        onLoadError={() => setErrors(current => ({ ...current, [photo.key]: true }))} />)}</div>
    <section aria-label="Fotos em revisão" className={photos.length === 1 ? 'min-w-0' : 'grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3'}>
      {photos.map((photo, index) => {
        const src = previews[photo.key] ?? loaded[photo.key]
        return <button key={photo.key} type="button" aria-label={`Ampliar foto ${index + 1} da revisão`} disabled={disabled || !src}
          onClick={event => { trigger.current = event.currentTarget; setExpandedKey(photo.key) }}
          className="group min-w-0 overflow-hidden rounded-card border border-border-control bg-surface-raised text-left disabled:cursor-not-allowed">
          <span className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-surface-soft">
            {src ? <img src={src} alt={alt(index)} className="h-full w-full object-contain" />
              : <span className="p-3 text-small text-text-secondary">{errors[photo.key] ? 'Foto indisponível.' : photo.file ? 'Prévia indisponível.' : 'Carregando foto…'}</span>}
          </span>
          <span className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-small font-bold"><span>Foto {index + 1}{index === 0 ? ' · Capa' : ''}</span><Icon name="frame" /></span>
        </button>
      })}
    </section>
    <PhotoLightbox photo={active && expandedPhoto && url ? { src: url, alt: alt(expanded), caption: `Foto ${expanded + 1} de ${photos.length}${expanded === 0 ? ' · Capa' : ''}` } : null}
      trigger={trigger} onClose={() => setExpandedKey(null)} />
  </>
}
