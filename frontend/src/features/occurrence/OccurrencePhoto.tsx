import { VideoPlaceholder } from './VideoPlaceholder'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/auth'
import type { Occurrence } from './occurrence'

export function OccurrencePhoto({ report, full = false, administrative = false, thumbnail = false, flush = false, mediaId }: { report: Occurrence; full?: boolean; administrative?: boolean; thumbnail?: boolean; flush?: boolean; mediaId?: string }) {
  if (report.media?.[0]?.type === 'VIDEO') return <VideoPlaceholder compact={thumbnail} flush={flush} duration={report.media[0].durationSeconds} />
  return <Photo report={report} full={full} thumbnail={thumbnail} flush={flush} administrative={administrative} mediaId={mediaId} />
}
function Photo({ report, full = false, administrative = false, thumbnail = false, flush = false, mediaId }: { report: Occurrence; full?: boolean; administrative?: boolean; thumbnail?: boolean; flush?: boolean; mediaId?: string }) {
  const { request, state } = useAuth()
  const owner = state.status === 'authenticated' ? state.user.id : null
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(full || thumbnail)
  const [photo, setPhoto] = useState<{ key: string; url: string } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const key = `${owner}/${administrative}/${report.id}/${report.version}/${mediaId ?? "cover"}`
  useEffect(() => {
    if (full || thumbnail || !container.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [full, thumbnail])
  useEffect(() => {
    if (!owner || !visible) return
    const controller = new AbortController()
    let url: string | undefined
    void request(`/api/${administrative ? 'admin/' : ''}occurrences/${report.id}/${mediaId ? `media/${mediaId}` : "image"}`, 'GET', controller.signal)
      .then(response => response.blob())
      .then(blob => {
        if (controller.signal.aborted) return
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || blob.size > 5242880) throw new Error('Invalid photo')
        url = URL.createObjectURL(blob)
        setPhoto({ key, url }); setFailed(null)
      }).catch(() => { if (!controller.signal.aborted) setFailed(key) })
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url) }
  }, [owner, visible, key, report.id, request, administrative, mediaId])
  return <div ref={container} className={`flex items-center justify-center overflow-hidden bg-surface-raised ${thumbnail ? 'size-20 shrink-0 rounded-control' : flush ? 'aspect-[4/3] rounded-t-card' : 'my-4 aspect-[4/3] rounded-card'}`}>
    {photo?.key === key ? <img className={full ? 'h-full w-full object-contain' : 'h-full w-full object-cover'} src={photo.url} alt={`Foto do problema: ${report.title}`} />
      : <p className={thumbnail ? 'p-1 text-center text-small text-text-secondary' : 'p-4 text-small text-text-secondary'} role="status">{failed === key ? thumbnail ? 'Foto não abriu' : 'Não foi possível carregar a foto.' : 'Carregando foto…'}</p>}
  </div>
}
