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
  return media?.type === 'VIDEO' ? <Player key={`${owner}/${props.report.id}/${media.id}/${props.publicView}/${props.administrative}`} {...props} request={request} /> : null
}
function Player({ report, publicView, administrative, request }: Props & { request: ReturnType<typeof useAuth>['request'] }) {
  const media = report.media![0]
  const [src, setSrc] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const download = useRef<AbortController | null>(null)
  const objectUrl = useRef<string | null>(null)
  const player = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const element = player.current
    return () => { if (element) { element.pause(); element.removeAttribute('src'); element.load() } }
  }, [src])
  const path = `/api/${publicView ? 'public/' : administrative ? 'admin/' : ''}occurrences/${report.id}/media/${media.id}`
  useEffect(() => {
    return () => {
      download.current?.abort()
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    }
  }, [])
  async function load() {
    if (download.current) return
    const controller = new AbortController(); download.current = controller
    setBusy(true); setError(false)
    try {
      if (publicView) setSrc(`${getApiUrl()}${path}`)
      else {
        const response = await request(path, 'GET', controller.signal)
        const blob = await readVideo(response, controller.signal)
        if (controller.signal.aborted) return
        const url = URL.createObjectURL(blob); objectUrl.current = url; setSrc(url)
      }
    } catch { if (!controller.signal.aborted) setError(true) }
    finally { if (!controller.signal.aborted) { setBusy(false); download.current = null } }
  }
  return <section aria-label="Reproduzir vídeo do relato" className="my-4 grid min-w-0 gap-3">
    {src ? <video ref={player} src={src} controls playsInline preload="none" className="max-h-[32rem] w-full rounded-card bg-surface-raised" aria-label={`Vídeo do problema: ${report.title}`} onError={() => {
      setError(true); setSrc(null); if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null }
    }} /> : <VideoPlaceholder duration={media.type === 'VIDEO' ? media.durationSeconds : undefined} />}
    {!publicView && <p className="text-small text-text-secondary">O vídeo carrega inteiro antes de tocar (até 25 MiB).</p>}
    {error && <Alert tone="danger" role="alert">Não foi possível carregar o vídeo. Tente novamente; o relato pode ter mudado.</Alert>}
    {!src && <Button disabled={busy} loading={busy} onClick={() => { void load() }}>{busy ? 'Carregando vídeo…' : error ? 'Tentar carregar novamente' : 'Carregar vídeo'}</Button>}
  </section>
}
