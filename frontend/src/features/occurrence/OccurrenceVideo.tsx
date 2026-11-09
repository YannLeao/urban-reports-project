import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Feedback'
import { getApiUrl } from '../../lib/api'
import { useAuth } from '../auth/auth'
import { readVideo } from './video-download'
import { VideoPlaceholder } from './VideoPlaceholder'
import type { Occurrence } from './occurrence'
import type { PublicOccurrence } from './public-occurrence'

type Props = { report: Occurrence | PublicOccurrence; administrative?: boolean; publicView?: boolean }
export function OccurrenceVideo(props: Props) {
  const { state, request } = useAuth()
  const media = props.report.media?.[0]
  const owner = state.status === 'authenticated' ? state.user.id : 'anonymous'
  const version = 'version' in props.report ? props.report.version : props.report.createdAt
  return media?.type === 'VIDEO' ? <Player key={`${owner}/${props.report.id}/${version}/${media.id}/${props.publicView}/${props.administrative}`} {...props} request={request} /> : null
}
function Player({ report, publicView, administrative, request }: Props & { request: ReturnType<typeof useAuth>['request'] }) {
  const media = report.media![0]
  const path = `/api/${publicView ? 'public/' : administrative ? 'admin/' : ''}occurrences/${report.id}/media/${media.id}`
  const [src, setSrc] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const player = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | null = null
    // Defer until after StrictMode's effect replay, without starting two downloads.
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return
      setBusy(true); setError(false); setSrc(null)
      try {
        if (publicView) setSrc(`${getApiUrl()}${path}`)
        else {
          const response = await request(path, 'GET', controller.signal)
          const blob = await readVideo(response, controller.signal)
          if (controller.signal.aborted) return
          objectUrl = URL.createObjectURL(blob); setSrc(objectUrl)
        }
      } catch { if (!controller.signal.aborted) { setError(true); setBusy(false) } }
    })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [path, publicView, request, attempt])
  useEffect(() => {
    const element = player.current
    return () => { if (element) { element.pause(); element.removeAttribute('src'); element.load() } }
  }, [src])
  return <section aria-label="Reproduzir vídeo do relato" className="my-4 grid min-w-0 gap-3">
    {src && !error ? <video ref={player} src={src} controls playsInline preload="metadata" className="max-h-[32rem] min-h-48 w-full rounded-card bg-surface-raised" aria-label={`Vídeo do problema: ${report.title}`} onLoadedMetadata={() => setBusy(false)} onCanPlay={() => setBusy(false)} onWaiting={() => setBusy(true)} onPlaying={() => setBusy(false)} onError={() => { setError(true); setBusy(false) }} /> : <VideoPlaceholder duration={media.type === 'VIDEO' ? media.durationSeconds : undefined} />}
    {busy && !error && <p role="status" className="m-0 flex items-center gap-2 text-small text-text-secondary"><span aria-hidden="true" className="size-4 animate-spin rounded-pill border-2 border-border-subtle border-t-brand-default motion-reduce:animate-none" />Carregando vídeo…</p>}
    {error && <><Alert tone="danger" role="alert">Não foi possível carregar o vídeo. Tente novamente; o relato pode ter mudado.</Alert><Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Tentar carregar novamente</Button></>}
  </section>
}
