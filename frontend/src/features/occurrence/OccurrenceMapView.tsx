import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Alert } from '../../components/ui/Feedback'
import { Button } from '../../components/ui/Button'
import { buttonStyles } from '../../components/ui/button-styles'
import { OccurrenceMap } from '../location/OccurrenceMap'
import { occurrenceStatusLabel } from './occurrence'
import type { OccurrenceMarker } from './markers'
import { useOwnMarkers, usePublicMarkers } from './useMarkers'
import { readView } from './map-navigation'

export function PublicMapView() { const query = usePublicMarkers(); return <MarkerResults query={query} own={false} /> }
export function OwnMapView() { const query = useOwnMarkers(); return <MarkerResults query={query} own /> }
function MarkerResults({ query, own }: { query: ReturnType<typeof usePublicMarkers>; own: boolean }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const client = useQueryClient()
  const [group, setGroup] = useState<string[]>([])
  const selected = params.get('selecionado')
  const data = query.data
  const active = data?.items.find(item => item.id === selected)
  const base = own ? '/meus-relatos' : '/ocorrencias'
  function select(id: string) {
    setParams(current => { const next = new URLSearchParams(current); next.set('selecionado', id); return next }, { replace: true })
  }
  function detail(item: OccurrenceMarker) {
    return <Link className={buttonStyles('secondary')} to={`${base}/${item.id}`} state={{ from: `${location.pathname}${location.search}` }}
      onClick={() => { client.removeQueries({ queryKey: own ? ['private'] : ['public', 'occurrences', 'detail', item.id], predicate: entry => !own || entry.queryKey[2] === 'occurrences' && entry.queryKey.at(-1) === item.id }) }}>
      Abrir detalhes de {item.title}
    </Link>
  }
  return <div className="mt-6 grid min-w-0 gap-4">
    <Button variant="secondary" loading={query.isFetching} onClick={() => { void query.refetch() }}>Atualizar mapa</Button>
    {query.isPending && <p role="status">Carregando todos os pontos…</p>}
    {query.isError && <Alert tone="danger" role="alert">Não foi possível atualizar os pontos.{data ? ' Os dados anteriores estão sendo exibidos e podem estar desatualizados.' : ' Tente novamente ou consulte pela lista.'}</Alert>}
    {data && <>
      <p role="status">{data.total} relatos no total. {data.located} com localização. {data.unlocated} sem localização no mapa. Consulte pela lista.</p>
      {data.total === 0 ? <p>Ainda não há relatos nesta consulta.</p> : data.located === 0 && <p>Nenhum relato desta consulta tem localização no mapa.</p>}
      <OccurrenceMap items={data.items} selected={active?.id ?? null} onSelect={select}
        onGroup={items => setGroup(items.map(item => item.id))} view={readView(params)} onView={view => {
          setParams(current => { const next = new URLSearchParams(current); next.set('lat', view.latitude.toFixed(6)); next.set('lng', view.longitude.toFixed(6)); next.set('zoom', String(view.zoom)); return next }, { replace: true })
        }} />
      {group.length > 1 && <section aria-label="Relatos do grupo" className="rounded-control border border-border-control p-3">
        <h2>Relatos próximos</h2><p>Escolha um relato; pontos iguais permanecem separados nesta lista.</p>
        <ul>{data.items.filter(item => group.includes(item.id)).map(item => <li key={item.id}><Button variant="quiet" onClick={() => select(item.id)}>{item.title} · {item.categoryName}</Button></li>)}</ul>
        <Button variant="quiet" onClick={() => setGroup([])}>Fechar grupo</Button>
      </section>}
      {active && <section aria-live="polite" aria-label="Relato selecionado" className="rounded-control border border-border-control p-4">
        <h2 className="text-xl">{active.title}</h2><p>{active.categoryName} · {occurrenceStatusLabel(active.status)}</p>{detail(active)}
      </section>}
      <details><summary className="min-h-target cursor-pointer font-bold">Selecionar entre todos os {data.located} relatos localizados (alternativa textual)</summary>
        <ul className="grid gap-2">{data.items.map(item => <li key={item.id} className="rounded-control border border-border-control p-3">
          <Button variant="quiet" aria-pressed={item.id === active?.id} onClick={() => select(item.id)}>Selecionar {item.title}</Button>
          <p>{item.categoryName} · {occurrenceStatusLabel(item.status)}</p>{detail(item)}
        </li>)}</ul>
      </details>
    </>}
  </div>
}
