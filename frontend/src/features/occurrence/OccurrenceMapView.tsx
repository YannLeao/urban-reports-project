import { deniedRead } from '../../lib/live-query'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { useAuth } from '../auth/auth'
import { useQueryClient } from '@tanstack/react-query'
import { Alert } from '../../components/ui/Feedback'
import { Button } from '../../components/ui/Button'
import { buttonStyles } from '../../components/ui/button-styles'
import { OccurrenceMap } from '../location/OccurrenceMap'
import { occurrenceStatusLabel } from './occurrence'
import type { OccurrenceMarker } from './markers'
import { useOwnMarkers, usePublicMarkers } from './useMarkers'
import { parseFilters, filterKey } from './filters'
import { readView } from './map-navigation'
import { CloseMapSelection, OwnMapSelection, PublicMapSelection } from './MapSelection'
import { useMapStageHeight } from '../location/useMapStageHeight'

export function PublicMapView() { const [params] = useSearchParams(); const filters = parseFilters(params, 'public').filters; const query = usePublicMarkers(filters); return <MarkerResults key={JSON.stringify(filterKey(filters))} query={query} own={false} /> }
export function OwnMapView() { const [params] = useSearchParams(); const filters = parseFilters(params, 'own').filters; const query = useOwnMarkers(filters); return <MarkerResults key={JSON.stringify(filterKey(filters))} query={query} own /> }
function historyKey() {
  const state: unknown = window.history.state
  return state && typeof state === 'object' && 'key' in state && typeof state.key === 'string' ? state.key : undefined
}
function MarkerResults({ query, own }: { query: ReturnType<typeof usePublicMarkers>; own: boolean }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const lastWrittenKey = useRef<string | undefined>(undefined)
  // Router search setters do not queue functional updates. Resize/move events may
  // arrive in the same frame as selection: merge against our latest write.
  const mounted = useRef(false)
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const latestParams = useRef(params)
  useLayoutEffect(() => { latestParams.current = params }, [params])
  const updateParams = useCallback((change: (next: URLSearchParams) => void) => {
    if (!mounted.current) return
    // BrowserRouter may publish history before React commits its transition.
    // Ignore old map events once another navigation has started; permit our own
    // consecutive query writes in the same frame. MemoryRouter has no history key.
    const browserKey = historyKey()
    if (browserKey && browserKey !== location.key && browserKey !== lastWrittenKey.current) return
    const next = new URLSearchParams(latestParams.current)
    change(next); latestParams.current = next
    setParams(next, { replace: true })
    lastWrittenKey.current = historyKey()
  }, [setParams, location.key])
  const client = useQueryClient()
  const { state } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : null
  const [group, setGroup] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const stage = useRef<HTMLDivElement>(null)
  const origin = useRef<HTMLElement | null>(null)
  const selected = params.get('selecionado')
  const data = deniedRead(query.error) ? undefined : query.data
  const availableHeight = useMapStageHeight(stage, data !== undefined)
  const active = data?.items.find(item => item.id === selected)
  const base = own ? '/meus-relatos' : '/ocorrencias'
  const listParams = new URLSearchParams(params); listParams.delete('visao')
  const list = `${base}?${listParams}`
  function select(id: string, reveal = false) {
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setNotice(''); setGroup([])
    updateParams(next => next.set('selecionado', id))
    if (reveal) requestAnimationFrame(() => stage.current?.scrollIntoView({ block: 'nearest' }))
  }
  function close() {
    // Restore keyboard access even if Leaflet replaced the original marker element.
    const trigger = origin.current?.isConnected ? origin.current : document.querySelector<HTMLElement>('.leaflet-marker-icon[aria-pressed="true"]')
    trigger?.focus({ preventScroll: true })
    updateParams(next => next.delete('selecionado'))
  }
  const unavailable = useCallback(() => {
    setNotice('Este relato não está mais disponível nesta consulta.')
    updateParams(next => next.delete('selecionado'))
    void client.invalidateQueries({ queryKey: own ? ['private', userId, 'occurrences', 'markers'] : ['public', 'occurrences', 'markers'] })
    void client.invalidateQueries({ queryKey: own ? ['private', userId, 'occurrences', 'list'] : ['public', 'occurrences', 'list'] })
  }, [client, own, userId, updateParams])
  useEffect(() => {
    if (data && selected && !active && !query.isFetching) {
      setNotice('Este relato não está mais disponível nesta consulta.')
      updateParams(next => next.delete('selecionado'))
    }
  }, [data, selected, active, query.isFetching, updateParams])
  function detail(item: OccurrenceMarker) {
    return <Link className={buttonStyles('secondary', '', 'compact')} to={`${base}/${item.id}`} state={{ from: `${location.pathname}${location.search}` }} aria-label={`Ver relato: ${item.title}`}>Ver relato</Link>
  }
  return <div className="mt-3 grid min-w-0 gap-3">
    {notice && <p role="status" className="mb-0 text-small">{notice}</p>}
    {query.isPending && <p role="status">Carregando todos os pontos…</p>}
    {query.isError && <Alert className="p-3 text-small" tone="danger" role="alert">Não foi possível atualizar os pontos.{data ? ' Os dados anteriores estão sendo exibidos e podem estar desatualizados.' : ' Tente novamente ou consulte pela lista.'}
      <Button size="compact" className="mt-2" variant="secondary" loading={query.isFetching} onClick={() => { void query.refetch() }}>Tentar novamente</Button>
    </Alert>}
    {data && <>
      {data.total > 0 && <p className="m-0 text-small">{data.total} relatos nesta consulta.</p>}
      {data.total === 0 ? <p role="status" className="mb-0 text-small">{params.has('categoria') || params.has('estado') ? 'Nenhum relato com estes filtros.' : 'Ainda não há relatos nesta consulta.'} <Link to={own ? '/registrar-ocorrencia' : '/ocorrencias'}>{own ? 'Relatar um problema' : 'Ver relatos em lista'}</Link></p>
        : data.located === 0 ? <p role="status" className="mb-0 text-small">Os relatos ainda não têm localização no mapa. <Link to={list}>Ver relatos em lista</Link></p>
          : data.unlocated > 0 && <p role="status" className="mb-0 text-small">{data.unlocated === 1 ? 'Há 1 relato sem ponto no mapa.' : `Há ${data.unlocated} relatos sem ponto no mapa.`} <Link to={list}>Ver relatos em lista</Link></p>}
      <div ref={stage} style={availableHeight === undefined ? undefined : { height: availableHeight }} className="grid h-[calc(100vh-18rem-env(safe-area-inset-bottom))] min-h-[26rem] min-w-0 grid-rows-[minmax(12rem,1fr)_auto] gap-2 supports-[height:100svh]:h-[calc(100svh-18rem-env(safe-area-inset-bottom))] md:h-[calc(100vh-15rem)] md:supports-[height:100svh]:h-[calc(100svh-15rem)]">
        <OccurrenceMap items={data.items} selected={active?.id ?? null} onSelect={select} explore
          onGroup={items => { origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setGroup(items.map(item => item.id)) }} view={readView(params)} onView={view => {
            updateParams(next => { next.set('lat', view.latitude.toFixed(6)); next.set('lng', view.longitude.toFixed(6)); next.set('zoom', String(view.zoom)) })
          }} />
        {group.length > 1 ? <section aria-label="Relatos do grupo" className="max-h-48 overflow-y-auto rounded-control border border-border-control bg-surface-raised p-3">
          <div className="flex items-center justify-between gap-2"><h2 className="m-0 text-base">Relatos próximos</h2><Button size="compact" variant="quiet" onClick={() => { origin.current?.focus({ preventScroll: true }); setGroup([]) }}>Fechar grupo</Button></div>
          <ul className="m-0 grid list-none gap-2 p-0">{data.items.filter(item => group.includes(item.id)).map(item => <li key={item.id}><Button size="compact" className="w-full justify-start text-left" variant="quiet" onClick={() => select(item.id)}>{item.title} · {item.categoryName}</Button></li>)}</ul>
        </section> : active && <section aria-live="polite" aria-label="Relato selecionado" className="flex max-h-40 min-w-0 items-start gap-2 overflow-y-auto rounded-control border border-border-subtle bg-surface-raised p-3 shadow-card">
          <div className="min-w-0 flex-1">{own ? <OwnMapSelection key={active.id} id={active.id} onUnavailable={unavailable} /> : <PublicMapSelection key={active.id} id={active.id} onUnavailable={unavailable} />}</div>
          <CloseMapSelection onClick={close} />
        </section>}
      </div>
      {data.located > 0 && <details><summary className="min-h-target cursor-pointer py-2 font-bold">Escolher relato em lista</summary>
        <ul className="grid list-none gap-2 p-0">{data.items.map(item => <li key={item.id} className="rounded-control border border-border-control p-3">
          <Button size="compact" variant="quiet" className="text-left" aria-pressed={item.id === active?.id} onClick={() => select(item.id, true)}>Selecionar {item.title}</Button>
          <p>{item.categoryName} · {occurrenceStatusLabel(item.status)}</p>{detail(item)}
        </li>)}</ul>
      </details>}
    </>}
  </div>
}
