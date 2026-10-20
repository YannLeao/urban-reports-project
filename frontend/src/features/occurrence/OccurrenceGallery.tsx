import { OccurrenceVideo } from './OccurrenceVideo'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import type { Occurrence } from './occurrence'
import type { PublicOccurrence } from './public-occurrence'
import { OccurrencePhoto } from './OccurrencePhoto'
import { PublicOccurrencePhoto } from './PublicOccurrencePhoto'

export function OccurrenceGallery({ report, administrative = false, publicView = false }: {
  report: Occurrence | PublicOccurrence; administrative?: boolean; publicView?: boolean
}) {
  if (report.media?.[0]?.type === 'VIDEO') return <OccurrenceVideo report={report} administrative={administrative} publicView={publicView} />
  // Key the state to the collection to avoid carrying a position into another report/version.
  return <Gallery key={`${report.id}/${report.media?.map(item => item.id).join('/')}`} report={report} administrative={administrative} publicView={publicView} />
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
