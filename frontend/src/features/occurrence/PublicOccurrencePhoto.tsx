import { useState } from 'react'
import { getApiUrl } from '../../lib/api'
import type { PublicOccurrence } from './public-occurrence'

export function PublicOccurrencePhoto({ report, full = false }: { report: PublicOccurrence; full?: boolean }) {
  const [failed, setFailed] = useState(false)
  let src: string | null = null
  try { src = `${getApiUrl()}/api/public/occurrences/${report.id}/image` } catch { src = null }
  return <div className="my-4 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-card bg-surface-raised">
    {src && !failed
      ? <img className={full ? 'h-full w-full object-contain' : 'h-full w-full object-cover'} src={src} loading={full ? 'eager' : 'lazy'} alt={`Foto do problema: ${report.title}`} onError={() => setFailed(true)} />
      : <p className="p-4 text-small text-text-secondary" role="status">Não foi possível carregar a foto.</p>}
  </div>
}