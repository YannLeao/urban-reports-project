import { VideoPlaceholder } from './VideoPlaceholder'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/auth'
import type { Occurrence } from './occurrence'

export function OccurrencePhoto({ report, full = false, administrative = false, thumbnail = false, flush = false, mediaId, active = true, onPreview }: { report: Occurrence; full?: boolean; administrative?: boolean; thumbnail?: boolean; flush?: boolean; mediaId?: string; active?: boolean; onPreview?: (url: string | null) => void }) {
  if (report.media?.[0]?.type === 'VIDEO') return <VideoPlaceholder compact={thumbnail} flush={flush} duration={report.media[0].durationSeconds} />
  return <Photo report={report} full={full} thumbnail={thumbnail} flush={flush} administrative={administrative} mediaId={mediaId} active={active} onPreview={onPreview} />
}
function Photo({ report, full = false, administrative = false, thumbnail = false, flush = false, mediaId, active = true, onPreview }: { report: Occurrence; full?: boolean; administrative?: boolean; thumbnail?: boolean; flush?: boolean; mediaId?: string; active?: boolean; onPreview?: (url: string | null) => void }) {
  const listener = useRef(onPreview)
  listener.current = onPreview
  const objectUrl = useRef<string | null>(null)
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
  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = null; listener.current?.(null)
  }, [key])
  useEffect(() => {
    if (!owner || !visible || !active || objectUrl.current) return
    const controller = new AbortController()
    void (async () => {
      // Skip Strict Mode's canceled subscription before initiating any media request.
      await Promise.resolve()
      if (controller.signal.aborted) return
      const response = await request(`/api/${administrative ? 'admin/' : ''}occurrences/${report.id}/${mediaId ? `media/${mediaId}` : 'image'}`, 'GET', controller.signal)
      const blob = await readPhoto(response, controller.signal)
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(blob)
      objectUrl.current = url; listener.current?.(url)
      setPhoto({ key, url }); setFailed(null)
    })().catch(() => { if (!controller.signal.aborted) setFailed(key) })
    return () => { controller.abort() }
  }, [owner, visible, key, report.id, request, administrative, mediaId, active])
  return <div ref={container} className={`flex items-center justify-center overflow-hidden bg-surface-raised ${thumbnail ? 'size-20 shrink-0 rounded-control' : flush ? 'aspect-[4/3] rounded-t-card' : 'my-4 aspect-[4/3] rounded-card'}`}>
    {photo?.key === key ? <img className={full ? 'h-full w-full object-contain' : 'h-full w-full object-cover'} src={photo.url} alt={`Foto do problema: ${report.title}`} />
      : <p className={thumbnail ? 'p-1 text-center text-small text-text-secondary' : 'p-4 text-small text-text-secondary'} role="status">{failed === key ? thumbnail ? 'Foto não abriu' : 'Não foi possível carregar a foto.' : 'Carregando foto…'}</p>}
  </div>
}

// Keep response-body consumption cancelable after AuthProvider has returned headers.
async function readPhoto(response: Response, signal: AbortSignal) {
  const type = response.headers.get('Content-Type')?.split(';')[0].trim()
  if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type) || !response.body) throw new Error('Invalid photo')
  const reader = response.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  const chunks: BlobPart[] = []
  let size = 0
  try {
    if (signal.aborted) throw new DOMException('Canceled', 'AbortError')
    for (;;) {
      const next = await reader.read()
      if (signal.aborted) throw new DOMException('Canceled', 'AbortError')
      if (next.done) break
      size += next.value.byteLength
      if (size > 5242880) throw new Error('Invalid photo')
      chunks.push(new Uint8Array(next.value))
    }
    return new Blob(chunks, { type })
  } finally {
    signal.removeEventListener('abort', cancel)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
