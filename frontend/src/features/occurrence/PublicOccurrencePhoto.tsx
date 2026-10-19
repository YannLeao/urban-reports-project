import { useState } from 'react'
import { getApiUrl } from '../../lib/api'
import type { PublicOccurrence } from './public-occurrence'

export function PublicOccurrencePhoto({ report, full = false, thumbnail = false, flush = false, mediaId }: { report: PublicOccurrence; full?: boolean; thumbnail?: boolean; flush?: boolean; mediaId?: string }) {
  const [failed, setFailed] = useState(false)
  let src: string | null = null
  try { src = `${getApiUrl()}/api/public/occurrences/${report.id}/${mediaId ? `media/${mediaId}` : "image"}` } catch { src = null }
  return <div className={`flex items-center justify-center overflow-hidden bg-surface-raised ${thumbnail ? 'size-20 shrink-0 rounded-control' : flush ? 'aspect-[4/3] rounded-t-card' : 'my-4 aspect-[4/3] rounded-card'}`}>
    {src && !failed
      ? <img className={full ? 'h-full w-full object-contain' : 'h-full w-full object-cover'} src={src} loading={full || thumbnail ? 'eager' : 'lazy'} alt={`Foto do problema: ${report.title}`} onError={() => setFailed(true)} />
      : <p className={thumbnail ? 'p-1 text-center text-small text-text-secondary' : 'p-4 text-small text-text-secondary'} role="status">{thumbnail ? 'Foto não abriu' : 'Não foi possível carregar a foto.'}</p>}
  </div>
}
