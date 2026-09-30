import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/auth'
import type { Occurrence } from './occurrence'

export function OccurrencePhoto({ report, full = false }: { report: Occurrence; full?: boolean }) {
  const { request, state } = useAuth()
  const owner = state.status === 'authenticated' ? state.user.id : null
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(full)
  const [photo, setPhoto] = useState<{ key: string; url: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const key = `${owner}/${report.id}/${report.version}`
  useEffect(() => {
    if (full || !container.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [full])
  useEffect(() => {
    if (!owner || !visible) return
    const controller = new AbortController()
    let url: string | undefined
    void request(`/api/occurrences/${report.id}/image`, 'GET', controller.signal)
      .then(response => response.blob())
      .then(blob => {
        if (controller.signal.aborted) return
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || blob.size > 5242880) throw new Error('Invalid photo')
        url = URL.createObjectURL(blob)
        setPhoto({ key, url }); setFailed(false)
      }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url) }
  }, [owner, visible, key, report.id, request])
  return <div ref={container} className="my-4 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-card bg-surface-raised">
    {photo?.key === key ? <img className={full ? 'h-full w-full object-contain' : 'h-full w-full object-cover'} src={photo.url} alt={`Foto do problema: ${report.title}`} />
      : <p className="p-4 text-small text-text-secondary" role="status">{failed ? 'Não foi possível carregar a foto.' : 'Carregando foto…'}</p>}
  </div>
}
