import { OccurrenceVideo } from './OccurrenceVideo'
import { useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import type { Occurrence } from './occurrence'
import type { PublicOccurrence } from './public-occurrence'
import { OccurrencePhoto } from './OccurrencePhoto'
import { PublicOccurrencePhoto } from './PublicOccurrencePhoto'
import { PhotoLightbox } from './PhotoLightbox'
import { Icon } from '../../components/ui/Icon'
import { useAuth } from '../auth/auth'

export function OccurrenceGallery({ report, administrative = false, publicView = false }: {
  report: Occurrence | PublicOccurrence; administrative?: boolean; publicView?: boolean
}) {
  const { state } = useAuth()
  const owner = state.status === 'authenticated' ? state.user.id : 'anonymous'
  if (report.media?.[0]?.type === 'VIDEO') return <OccurrenceVideo report={report} administrative={administrative} publicView={publicView} />
  if (!publicView) return <PrivateGallery key={`${owner}/${administrative}/${report.id}/${(report as Occurrence).version}/${report.media?.map(item => item.id).join('/')}`} report={report as Occurrence} administrative={administrative} />
  // Key the state to the collection to avoid carrying a position into another report/version.
  return <Gallery key={`${report.id}/${report.media?.map(item => item.id).join('/')}`} report={report} administrative={administrative} publicView={publicView} />
}

function PrivateGallery({ report, administrative }: { report: Occurrence; administrative: boolean }) {
  const slots = report.media?.length ? report.media.map(item => ({ key: item.id, id: item.id })) : [{ key: 'cover', id: undefined }]
  const [selected, setSelected] = useState(0)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState(false)
  const trigger = useRef<HTMLElement | null>(null)
  const src = urls[slots[selected].key]
  const caption = `Foto ${selected + 1} de ${slots.length}${selected === 0 ? ' · Capa' : ''}`
  return <section aria-label="Fotografias do relato" className="my-5 min-w-0">
    {/* One resource owner per saved photo; thumbnails, main view and modal share its URL. */}
    <div hidden aria-hidden="true">{slots.map(slot => <OccurrencePhoto key={slot.key} report={report} mediaId={slot.id} administrative={administrative} thumbnail
      onPreview={url => { setUrls(current => { const next = { ...current }; if (url) next[slot.key] = url; else delete next[slot.key]; return next }) }}
      onLoadError={() => setErrors(current => ({ ...current, [slot.key]: true }))} />)}</div>
    <div className={slots.length > 1 ? 'grid min-w-0 gap-3 md:grid-cols-[5rem_minmax(0,1fr)]' : 'min-w-0'}>
      <div className="min-w-0 md:col-start-2">
        <div className="flex h-[min(55svh,28rem)] min-h-56 items-center justify-center overflow-hidden rounded-card border border-border-subtle bg-surface-soft">
          {src ? <img src={src} alt={slots.length === 1 ? `Foto do problema: ${report.title}` : `Foto ${selected + 1} do problema: ${report.title}`} className="h-full w-full object-contain" />
            : <p role="status" className="p-5 text-center text-small text-text-secondary">{errors[slots[selected].key] ? 'Não foi possível carregar a foto. Você pode escolher outra imagem.' : 'Carregando foto…'}</p>}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="mb-0 text-small font-bold" aria-live="polite">{caption}</p>
          <Button variant="secondary" size="compact" disabled={!src} onClick={event => { trigger.current = event.currentTarget; setExpanded(true) }}><Icon name="frame" />Ampliar foto</Button>
        </div>
      </div>
      {slots.length > 1 && <div aria-label="Miniaturas das fotos" className="flex min-w-0 gap-2 overflow-x-auto py-1 md:col-start-1 md:row-start-1 md:max-h-[28rem] md:flex-col md:overflow-y-auto md:pr-1">
        {slots.map((slot, index) => <button key={slot.key} type="button" aria-label={`Selecionar foto ${index + 1}${index === 0 ? ', capa' : ''}`} aria-pressed={selected === index}
          onClick={() => setSelected(index)} className={`relative flex h-20 w-20 min-w-20 shrink-0 flex-col overflow-hidden rounded-control border-2 ${selected === index ? 'border-text-primary' : 'border-border-subtle'}`}>
          {urls[slot.key] ? <img src={urls[slot.key]} alt="" className="min-h-0 w-full flex-1 object-cover" /> : <span className="flex w-full flex-1 items-center justify-center bg-surface-soft text-small">{errors[slot.key] ? 'Erro' : '…'}</span>}
          <span className="w-full bg-surface-raised text-small font-bold">{index + 1}{index === 0 ? ' · Capa' : ''}{selected === index ? ' ✓' : ''}</span>
        </button>)}
      </div>}
    </div>
    <PhotoLightbox photo={expanded && src ? { src, alt: `Foto ${selected + 1} do problema: ${report.title}`, caption } : null} trigger={trigger} onClose={() => setExpanded(false)} />
  </section>
}
function Gallery({ report, administrative, publicView }: { report: Occurrence | PublicOccurrence; administrative: boolean; publicView: boolean }) {
  const [selected, setSelected] = useState(0)
  const media = report.media ?? []
  const mediaId = media[selected]?.id
  return <section aria-label="Fotografias do relato" className="min-w-0">
    {publicView ? <PublicOccurrencePhoto key={mediaId ?? report.id} report={report} mediaId={mediaId} full />
      : <OccurrencePhoto report={report as Occurrence} mediaId={mediaId} administrative={administrative} full />}
    {media.length > 1 && <div className="flex flex-wrap items-center justify-center gap-3">
      <Button variant="secondary" disabled={selected === 0} onClick={() => setSelected(selected - 1)} aria-label="Foto anterior">Anterior</Button>
      <p aria-live="polite">Foto {selected + 1} de {media.length}{selected === 0 ? ' · Capa' : ''}</p>
      <Button variant="secondary" disabled={selected === media.length - 1} onClick={() => setSelected(selected + 1)} aria-label="Próxima foto">Próxima</Button>
    </div>}
  </section>
}
